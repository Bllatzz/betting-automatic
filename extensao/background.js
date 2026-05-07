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

    console.log('[BG] 📨 Aposta recebida:', aposta);
    const enviado = await enviarParaAba(aposta);
    // Só marca como processada se o content script confirmou recebimento.
    // Se a tab estava navegando ou ocupada, não atualiza ultimo para que a
    // próxima poll tente novamente.
    if (enviado) ultimo = aposta.id;

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
    return false;
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
    const res = await chrome.tabs.sendMessage(tab.id, { acao: 'apostar', aposta });
    if (res?.ok) {
      console.log('[BG] 📡 Instrução enviada para a aba');
      return true;
    }
    // Content script ocupado (executando outra aposta) — retenta na próxima poll
    console.warn('[BG] ⚠️ Content script ocupado, retentando na próxima poll');
    return false;
  } catch (e) {
    // Tab ainda carregando ou sem content script — retenta na próxima poll
    console.warn('[BG] ⚠️ Não foi possível enviar para aba:', e.message);
    return false;
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

// Mapeia char pra info da tecla (key, code, vk) — necessário pro Chrome aceitar
// como digitação real. Cobre dígitos, vírgula e ponto (suficiente pra stake).
function infoTecla(char) {
  const ascii = char.charCodeAt(0);
  let code = '';
  if (/[0-9]/.test(char))         code = `Digit${char}`;
  else if (char === ',')          code = 'Comma';
  else if (char === '.')          code = 'Period';
  else if (/[a-zA-Z]/.test(char)) code = `Key${char.toUpperCase()}`;
  return { key: char, code, windowsVirtualKeyCode: ascii, nativeVirtualKeyCode: ascii };
}

// Digitação humana via CDP — clica, limpa o campo (Ctrl+A + Backspace) e
// digita caractere por caractere com keyDown/keyUp. Necessário pro stake do
// Bet365: o React ignora insertText e execCommand mas aceita keyDown com text.
async function digitarCDP(tabId, x, y, texto) {
  try { await chrome.debugger.attach({ tabId }, '1.3'); } catch {}
  try {
    const send = (params) => chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', params);
    const mouse = (type) => chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
      type, x, y, button: 'left', clickCount: 1, modifiers: 0,
    });
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // 1. Click pra focar
    await mouse('mousePressed');
    await sleep(50);
    await mouse('mouseReleased');
    await sleep(200);

    // 2. Ctrl+A — selecionar tudo
    const keyA = { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 };
    await send({ type: 'rawKeyDown', modifiers: 2, ...keyA });
    await send({ type: 'keyUp',      modifiers: 2, ...keyA });
    await sleep(80);

    // 3. Backspace — apaga a seleção (sobrevive a campos que ignoram replace por insertText)
    const keyBs = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
    await send({ type: 'rawKeyDown', ...keyBs });
    await send({ type: 'keyUp',      ...keyBs });
    await sleep(100);

    // 4. Digita char por char — keyDown com `text` dispara keypress + insere o caractere
    for (const char of texto) {
      const info = infoTecla(char);
      await send({ type: 'keyDown', text: char, unmodifiedText: char, ...info });
      await send({ type: 'keyUp', ...info });
      await sleep(60 + Math.random() * 60); // jitter humano
    }
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

  if (msg.acao === 'digitar_cdp') {
    const tabId = sender.tab?.id || msg.tabId;
    digitarCDP(tabId, msg.x, msg.y, msg.texto)
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, erro: e.message }));
    return true; // async
  }

  if (msg.acao === 'reagendar') {
    fetch(`${SERVER}/reagendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg.payload),
    }).catch(() => {});
    sendResponse({ ok: true });
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
