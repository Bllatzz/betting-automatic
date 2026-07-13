let SERVER        = 'http://localhost:3002';
let BRIDGE_SECRET = '';

async function carregarConfig() {
  const data = await chrome.storage.local.get(['serverUrl', 'bridgeSecret']);
  SERVER        = data.serverUrl    || 'http://localhost:3002';
  BRIDGE_SECRET = data.bridgeSecret || '';
  document.getElementById('inputServerUrl').value    = SERVER;
  document.getElementById('inputBridgeSecret').value = BRIDGE_SECRET;
}

function headersAuth() {
  const h = {};
  if (BRIDGE_SECRET) h['X-Bridge-Secret'] = BRIDGE_SECRET;
  return h;
}

const dot        = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const ultimaDiv  = document.getElementById('ultima');
const ultimaInfo = document.getElementById('ultima-info');
const msgEl      = document.getElementById('msg');
const btnTeste   = document.getElementById('btnTeste');
const btnSalvar  = document.getElementById('btnSalvar');

// ─── STATUS DO SERVIDOR ───────────────────────────────────────────────────────

async function verificarServidor() {
  try {
    const res = await fetch(`${SERVER}/status`, {
      headers: headersAuth(),
      signal: AbortSignal.timeout(2000),
    });
    const { ultimaAposta } = await res.json();

    dot.className = 'dot ok';
    statusText.innerHTML = `Servidor <strong>online</strong>`;

    if (ultimaAposta) {
      ultimaDiv.style.display = 'block';
      const { timeCasa, timeVisitante, mercadoAsiatico, linha, offset, direcao, sucesso } = ultimaAposta;
      const dir = direcao === 'mais' ? 'Over' : 'Under';
      const linhaExibida = linha != null ? linha : (offset != null ? `+${offset}` : '?');
      ultimaInfo.textContent =
        `${timeCasa} x ${timeVisitante} · ${mercadoAsiatico || '?'} ${dir} ${linhaExibida} ${sucesso ? '✅' : '❌'}`;
    }
  } catch {
    dot.className = 'dot err';
    statusText.innerHTML = 'Servidor <strong>offline</strong>';
  }
}

// ─── SALVAR CONFIGURAÇÕES ─────────────────────────────────────────────────────

btnSalvar.addEventListener('click', async () => {
  const url    = document.getElementById('inputServerUrl').value.trim();
  const secret = document.getElementById('inputBridgeSecret').value.trim();

  await chrome.storage.local.set({ serverUrl: url, bridgeSecret: secret });
  SERVER        = url    || 'http://localhost:3002';
  BRIDGE_SECRET = secret || '';
  mostrarMsg('Configurações salvas!', 'ok');
  verificarServidor();
});

// ─── TESTE MANUAL ─────────────────────────────────────────────────────────────

btnTeste.addEventListener('click', async () => {
  const timeCasa        = document.getElementById('timeCasa').value.trim();
  const timeVisitante   = document.getElementById('timeVisitante').value.trim();
  const mercadoAsiatico = document.getElementById('mercadoAsiatico').value;
  const offsetRaw       = document.getElementById('offset').value.trim();
  const direcao         = document.getElementById('direcao').value;
  const valorReais      = parseFloat(document.getElementById('valor').value) || 0.50;

  if (!timeCasa || !timeVisitante) { mostrarMsg('Preenche os dois times!', 'err'); return; }
  if (offsetRaw === '') { mostrarMsg('Informe o offset (ex: 0.5, 3.5, 2.0)', 'err'); return; }
  const offset = parseFloat(offsetRaw);
  if (isNaN(offset) || offset < 0) { mostrarMsg('Offset inválido — use um número >= 0', 'err'); return; }

  const [tab] = await chrome.tabs.query({ url: ['*://*.bet365.bet.br/*', '*://bet365.bet.br/*'] });
  if (!tab) { mostrarMsg('Abre o bet365.bet.br primeiro!', 'err'); return; }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch { /* já injetado */ }

  await new Promise(r => setTimeout(r, 300));

  try {
    await chrome.tabs.sendMessage(tab.id, {
      acao: 'apostar',
      aposta: { timeCasa, timeVisitante, mercadoAsiatico, offset, direcao, valorReais, dryRun: true, id: 'teste-popup' },
    });
    mostrarMsg('Teste enviado! Veja o F12 no Bet365.', 'ok');
  } catch (e) {
    mostrarMsg('Erro ao contactar Bet365: ' + e.message, 'err');
    return;
  }

  window.close();
});

function mostrarMsg(texto, tipo) {
  msgEl.textContent = texto;
  msgEl.className = `msg ${tipo}`;
  msgEl.style.display = 'block';
  setTimeout(() => msgEl.style.display = 'none', 3000);
}

carregarConfig().then(() => {
  verificarServidor();
  setInterval(verificarServidor, 3000);
});
