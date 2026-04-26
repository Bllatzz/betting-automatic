// background.js — Polling do servidor local
// O background não tem restrição de mixed content, então consegue
// chamar http://localhost mesmo estando o Bet365 em HTTPS

const SERVER = 'http://localhost:3002';

let ultimo    = null;
let pollTimer = null;

async function poll() {
  try {
    const res = await fetch(`${SERVER}/pendente`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const aposta = await res.json();
    if (!aposta?.id || aposta.id === ultimo) return;

    ultimo = aposta.id;
    console.log('[BG] 📨 Aposta recebida:', aposta);
    await enviarParaAba(aposta);

  } catch {
    // servidor offline ou sem resposta — silencioso
  } finally {
    // Agenda próximo poll (setInterval não é confiável em service workers MV3)
    pollTimer = setTimeout(poll, 2000);
  }
}

async function enviarParaAba(aposta) {
  const tabs = await chrome.tabs.query({ url: ['*://*.bet365.bet.br/*', '*://bet365.bet.br/*'] });

  if (tabs.length === 0) {
    console.warn('[BG] ⚠️ Nenhuma aba do Bet365 aberta');
    return;
  }

  const tab = tabs[0];

  // Garante que o content script está injetado antes de enviar
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch {
    // Já estava injetado — normal, ignora
  }

  await new Promise(r => setTimeout(r, 300)); // pequena espera após injeção

  try {
    await chrome.tabs.sendMessage(tab.id, { acao: 'apostar', aposta });
    console.log('[BG] 📡 Instrução enviada para a aba');
  } catch (e) {
    console.error('[BG] ❌ Erro ao enviar para aba:', e.message);
  }
}

// Clique via CDP — cria evento isTrusted:true, necessário para confirmar aposta
async function clicarCDP(tabId, x, y) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch {
    // já attachado — ok
  }
  const evento = (type) => chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
    type, x, y, button: 'left', clickCount: 1, modifiers: 0,
  });
  try {
    await evento('mousePressed');
    await new Promise(r => setTimeout(r, 80));
    await evento('mouseReleased');
    await evento('mouseMoved');
  } finally {
    try { await chrome.debugger.detach({ tabId }); } catch {}
  }
}

// Recebe resultado do content script e repassa ao servidor
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.acao === 'resultado') {
    fetch(`${SERVER}/resultado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg.payload),
    }).catch(() => {});
    sendResponse({ ok: true });
  }

  if (msg.acao === 'clicar_cdp') {
    const tabId = sender.tab?.id || msg.tabId;
    clicarCDP(tabId, msg.x, msg.y)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, erro: e.message }));
    return true; // async
  }

  return true;
});

// Alarm para acordar o service worker a cada 30s e reiniciar o polling se necessário
chrome.alarms.create('poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(name => {
  if (name === 'poll') {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    poll();
  }
});

// Inicia
poll();
console.log('[BG] ✅ Background ativo');
