// background.js — Polling do servidor bridge

let SERVER        = 'http://localhost:3002';
let BRIDGE_SECRET = '';
let ultimo        = null;
let pollTimer     = null;

async function carregarConfig() {
  const data = await chrome.storage.local.get(['serverUrl', 'bridgeSecret']);
  if (data.serverUrl)    SERVER        = data.serverUrl;
  if (data.bridgeSecret) BRIDGE_SECRET = data.bridgeSecret;
}

function headersAuth() {
  const h = {};
  if (BRIDGE_SECRET) h['X-Bridge-Secret'] = BRIDGE_SECRET;
  return h;
}

async function poll() {
  try {
    const res = await fetch(`${SERVER}/pendente`, {
      headers: headersAuth(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return;
    const aposta = await res.json();
    if (!aposta?.id || aposta.id === ultimo) return;

    console.log('[BG] 📨 Aposta recebida:', aposta);
    const enviado = await enviarParaAba(aposta);
    if (enviado) ultimo = aposta.id;

  } catch {
    // servidor offline ou sem resposta — silencioso
  } finally {
    pollTimer = setTimeout(poll, 2000);
  }
}

async function enviarParaAba(aposta) {
  const tabs = await chrome.tabs.query({ url: ['*://*.bet365.bet.br/*', '*://bet365.bet.br/*'] });
  if (!tabs.length) {
    console.log('[BG] Nenhuma aba Bet365 aberta.');
    return false;
  }

  const tab = tabs[0];

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch { /* já injetado */ }

  await new Promise(r => setTimeout(r, 300));

  try {
    await chrome.tabs.sendMessage(tab.id, { acao: 'apostar', aposta });
    return true;
  } catch (e) {
    console.error('[BG] Erro ao enviar para aba:', e.message);
    return false;
  }
}

// Reinicia poll quando configurações mudam
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.serverUrl)    SERVER        = changes.serverUrl.newValue    || 'http://localhost:3002';
  if (changes.bridgeSecret) BRIDGE_SECRET = changes.bridgeSecret.newValue || '';
});

// Inicia
carregarConfig().then(() => poll());
