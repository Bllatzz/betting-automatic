// content.js — Betting Userbot (Bet365)
// Usa sessionStorage para sobreviver às navegações entre páginas
// Guard: background.js injeta este script a cada mensagem recebida.
// Sem o guard, const SERVER seria redeclarado e quebraria com SyntaxError.
if (!window.__betBotAtivo) {
window.__betBotAtivo = true;

const SERVER    = 'http://localhost:3002';
const STATE_KEY = '__bet_bot_state__';

// ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(seletores, timeout = 10000) {
  const lista = Array.isArray(seletores) ? seletores : [seletores];
  const ini = Date.now();
  while (Date.now() - ini < timeout) {
    for (const sel of lista) {
      try { const el = document.querySelector(sel); if (el) return el; } catch {}
    }
    await sleep(200);
  }
  return null;
}

// Simula digitação real (React usa eventos sintéticos)
// Usa InputEvent para o 'input' — o React distingue Event de InputEvent internamente
function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, valor);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: valor }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Simula digitação tecla a tecla
// IMPORTANTE: acumula o valor numa variável própria — NÃO lê input.value,
// pois o React pode resetar o valor controlado entre chamadas de digitar()
async function digitarDevagar(input, valor) {
  input.focus();
  await sleep(100);
  let acumulado = '';
  for (const char of valor) {
    acumulado += char;
    digitar(input, acumulado);
    await sleep(50 + Math.random() * 30);
  }
}

async function clicar(el, label) {
  if (!el) { console.warn(`[BOT] ⚠️ Não achei: ${label}`); return false; }
  el.scrollIntoView({ block: 'center' });
  await sleep(200);
  el.click();
  console.log(`[BOT] ✅ Clicou: ${label}`);
  return true;
}

// Clique via CDP — isTrusted:true, necessário para ações financeiras no Bet365
async function clicarCDP(el, label) {
  if (!el) { console.warn(`[BOT] ⚠️ Não achei: ${label}`); return false; }
  el.scrollIntoView({ block: 'center' });
  await sleep(300);
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top  + r.height / 2);
  await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ acao: 'clicar_cdp', x: cx, y: cy }, res => {
      if (res?.ok) resolve(); else reject(new Error(res?.erro || 'CDP falhou'));
    });
  });
  console.log(`[BOT] ✅ CDP clicou: ${label}`);
  return true;
}

// Clique com eventos completos de mouse — necessário para itens de navegação do Bet365
async function clicarNavegar(el, label) {
  if (!el) { console.warn(`[BOT] ⚠️ Não achei: ${label}`); return false; }
  el.scrollIntoView({ block: 'center' });
  await sleep(200);
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
  el.dispatchEvent(new PointerEvent('pointerover',  { ...opts, pointerId: 1 }));
  el.dispatchEvent(new MouseEvent ('mouseover',     opts));
  el.dispatchEvent(new PointerEvent('pointerdown',  { ...opts, pointerId: 1 }));
  el.dispatchEvent(new MouseEvent ('mousedown',     opts));
  el.dispatchEvent(new PointerEvent('pointerup',    { ...opts, pointerId: 1 }));
  el.dispatchEvent(new MouseEvent ('mouseup',       opts));
  el.dispatchEvent(new MouseEvent ('click',         opts));
  el.click();
  console.log(`[BOT] ✅ Navegou: ${label}`);
  return true;
}

// ─── DEBUG SCAN ──────────────────────────────────────────────────────────────
// Roda quando a extensão não sabe os seletores certos — loga tudo no F12

function debugScan() {
  console.group('[BOT] 🔍 DEBUG SCAN — elementos da página');

  // Prefixos comuns da Bet365
  const prefixos = ['gl-', 'sl-', 'cm-', 'rcl-', 'hm-', 'myb-', 'ipp-', 'wn-', 'src-'];
  const encontrados = {};
  document.querySelectorAll('*').forEach(el => {
    for (const cls of el.classList) {
      const p = prefixos.find(px => cls.startsWith(px));
      if (p) { encontrados[p] = encontrados[p] || new Set(); encontrados[p].add(cls); }
    }
  });
  for (const [p, classes] of Object.entries(encontrados)) {
    console.log(`  ${p}*  →`, [...classes].slice(0, 15).join(', '));
  }

  // Elementos que parecem botões de odd (texto numérico clicável)
  const odds = [...document.querySelectorAll('[class]')].filter(el => {
    const txt = el.textContent.trim();
    return /^\d+[.,]\d+$/.test(txt) && el.offsetParent !== null;
  });
  console.log(`\n  Possíveis botões de odd (${odds.length}):`,
    odds.slice(0, 10).map(el => `${el.className.split(' ')[0]}="${el.textContent.trim()}"`).join('  |  ')
  );

  // Textos de mercado visíveis
  const mercados = [...document.querySelectorAll('[class]')].filter(el => {
    const txt = el.textContent.trim();
    return ['resultado', 'result', '1x2', 'match'].some(k => txt.toLowerCase().startsWith(k))
      && el.children.length === 0 && el.offsetParent !== null;
  });
  console.log(`\n  Textos de mercado encontrados:`,
    mercados.map(el => `"${el.textContent.trim()}" [${el.className.split(' ')[0]}]`).join('  |  ')
  );

  console.groupEnd();
}

// ─── MÁQUINA DE ESTADO ────────────────────────────────────────────────────────

function salvarEstado(fase, aposta, retryCount = 0) {
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ fase, aposta, retryCount }));
}

function limparEstado() {
  sessionStorage.removeItem(STATE_KEY);
}

function carregarEstado() {
  try { return JSON.parse(sessionStorage.getItem(STATE_KEY)); } catch { return null; }
}

// ─── DIAGNÓSTICO DE BUSCA ────────────────────────────────────────────────────

function diagnosticarBusca() {
  console.group('[BOT] 🔬 DIAGNÓSTICO — elementos de busca na página');

  // Todos os inputs visíveis
  const inputs = [...document.querySelectorAll('input')].filter(el => el.offsetParent !== null);
  console.log(`Inputs visíveis (${inputs.length}):`);
  inputs.forEach(el => console.log(`  <input class="${el.className}" type="${el.type}" placeholder="${el.placeholder}">`));

  // Todos os botões visíveis com texto curto (prováveis ícones/ações)
  const btns = [...document.querySelectorAll('button, [role="button"]')]
    .filter(el => el.offsetParent !== null);
  console.log(`\nBotões visíveis (${btns.length}):`);
  btns.slice(0, 20).forEach(el =>
    console.log(`  class="${el.className.split(' ').slice(0,2).join(' ')}" texto="${el.textContent.trim().slice(0,30)}"`)
  );

  // Elementos com "search" ou "busca" em qualquer atributo
  const searchEls = [...document.querySelectorAll('*')].filter(el => {
    const attrs = [...el.attributes].map(a => a.value.toLowerCase()).join(' ');
    return (attrs.includes('search') || attrs.includes('busca')) && el.offsetParent !== null;
  });
  console.log(`\nElementos com "search"/"busca" em atributos (${searchEls.length}):`);
  searchEls.slice(0, 10).forEach(el =>
    console.log(`  <${el.tagName.toLowerCase()} class="${el.className.split(' ')[0]}" aria-label="${el.getAttribute('aria-label') || ''}" title="${el.title || ''}">`)
  );

  console.groupEnd();
}

// ─── BUSCA DO JOGO ────────────────────────────────────────────────────────────

function primeiraPalavraSignificativa(nome) {
  const ignorar = /^(npl|fc|sc|ff|f|united|city|the|afc|cf|ac|as|bk|sk|if|ik|fk|ok)$/i;
  return nome.replace(/\([^)]*\)/g, '').split(' ')
    .filter(w => w.length >= 3 && !ignorar.test(w))[0] || '';
}

// Retorna [termoCasa, termoVisitante] — um por vez, casa primeiro
function termosDeBusca(timeCasa, timeVisitante) {
  const casa  = primeiraPalavraSignificativa(timeCasa);
  const visit = primeiraPalavraSignificativa(timeVisitante);
  return [casa, visit].filter(Boolean);
}

// Retorna true se o texto do elemento "bate" com o jogo (os dois times presentes)
function textoCorresponde(txt, timeCasa, timeVisitante) {
  const normalizar = s => s.replace(/\([^)]*\)/g, '').toLowerCase();
  const palavrasCasa  = normalizar(timeCasa).split(' ').filter(p => p.length >= 3);
  const palavrasVisit = normalizar(timeVisitante).split(' ').filter(p => p.length >= 3);
  const t = normalizar(txt);
  const acertosCasa  = palavrasCasa.filter(p => t.includes(p)).length;
  const acertosVisit = palavrasVisit.filter(p => t.includes(p)).length;
  return acertosCasa >= 1 && acertosVisit >= 1;
}

// Seletor único para o input de busca (compatível com sml- e ssu-)
const SEL_SEARCH_INPUT = [
  '.sml-SearchTextInput',
  'input[class*="SearchText"]',
  'input[class*="SearchInput"]',
  '[class*="sml-Search"] input',
  '[class*="ssu-Search"] input',
  '[class*="SearchBar"] input',
  'input[placeholder]',
];

// Seletor para área de resultados de busca (compatível com sml- e ssu-)
const SEL_RESULTS = '[class*="sml-"], [class*="ssu-"]';

function buscarInputBusca() {
  for (const sel of SEL_SEARCH_INPUT) {
    try { const el = document.querySelector(sel); if (el) return el; } catch {}
  }
  return null;
}

// ─── FASE 1: navega para Ao-Vivo → futebol → clica no jogo ──────────────────

async function faseBusca(aposta) {
  // 1. Navega para aba "Ao-Vivo" no header
  await navegarAoVivo();

  // 2. Clica no ícone de futebol (classification/1.svg)
  await clicarIconeFutebol();

  // 3. Procura o jogo pelo texto (estilo Ctrl+F) e clica
  const clicouJogo = await procurarEClicarJogo(aposta);

  if (!clicouJogo) {
    limparEstado();
    await reportarResultado({ sucesso: false, erro: 'Jogo não encontrado na lista Ao Vivo', etapa: 'busca', ...aposta });
    return;
  }

  salvarEstado('odds-asiaticas', aposta);

  // 4. Aguarda a URL mudar (SPA — não recarrega o script)
  const urlAntes = location.href;
  console.log('[BOT] ⏳ Aguardando navegação para página do jogo...');
  const limiteNav = Date.now() + 8000;
  while (Date.now() < limiteNav) {
    if (location.href !== urlAntes) {
      console.log('[BOT] ✅ Navegou:', location.href);
      break;
    }
    await sleep(300);
  }
  if (location.href === urlAntes) {
    console.warn('[BOT] ⚠️ URL não mudou após clique — continuando mesmo assim');
  }
  await sleep(1000); // aguarda conteúdo do jogo renderizar

  // 5. Chama diretamente — SPA não recarrega o content script
  await faseOddsAsiaticas(aposta);
}

// Clica na aba "Ao-Vivo" do header se ainda não estiver lá
async function navegarAoVivo() {
  // Se já tem a barra de classificações (ovm-) na página, já está em Ao Vivo
  if (document.querySelector('[class*="ovm-ClassificationBar"]')) {
    console.log('[BOT] ℹ️ Já está na área Ao Vivo');
    return;
  }

  const norm = s => s.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]+/g, '');

  // Procura o botão pelo texto "Ao-Vivo" / "Ao Vivo" / "Live"
  const btn = [...document.querySelectorAll('button, span, a, li')]
    .find(el => {
      if (!el.offsetParent) return false;
      const txt = norm(el.textContent);
      return txt === 'aovivo' || txt === 'live' || txt === 'inplay';
    });

  if (btn) {
    await clicarNavegar(btn, '"Ao-Vivo" (header)');
    await sleep(1500);
  } else {
    console.warn('[BOT] ⚠️ Botão "Ao-Vivo" não encontrado — continuando na página atual');
  }
}

// Clica no ícone de futebol (classification/1.svg) na barra de esportes
async function clicarIconeFutebol() {
  const sels = [
    'img[src*="classification/1.svg"]',
    '[class*="ovm-ClassificationBarButton"] img[src*="/1.svg"]',
    '[class*="ClassificationBarButton"] img[src*="/1"]',
  ];

  for (const sel of sels) {
    try {
      const img = document.querySelector(sel);
      if (img && img.offsetParent !== null) {
        // Sobe para o botão clicável
        const btn = img.closest('button, [role="button"]') || img.parentElement || img;
        await clicarNavegar(btn, 'ícone futebol (classification/1.svg)');
        await sleep(1500);
        return;
      }
    } catch {}
  }
  console.warn('[BOT] ⚠️ Ícone de futebol não encontrado — usando lista atual');
}

// Sobe do leaf até o primeiro ancestral que tem handler de navegação/clique real
function ancestralNavegavel(el) {
  let node = el.parentElement;
  for (let i = 0; i < 8 && node; i++) {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'a' || tag === 'button') return node;
    if (node.getAttribute('role') === 'link' || node.getAttribute('role') === 'button') return node;
    if (node.onclick || node.getAttribute('onclick')) return node;
    // Bet365 usa divs clicáveis com cursor:pointer
    if (getComputedStyle(node).cursor === 'pointer' && node.offsetParent) return node;
    node = node.parentElement;
  }
  return null;
}

// Procura o jogo pelo texto (estilo Ctrl+F) e clica no texto do time da casa
async function procurarEClicarJogo(aposta) {
  console.log(`[BOT] 🔍 Procurando "${aposta.timeCasa} x ${aposta.timeVisitante}" na lista...`);

  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const termoCasa  = norm(primeiraPalavraSignificativa(aposta.timeCasa));
  const termoVisit = norm(primeiraPalavraSignificativa(aposta.timeVisitante));

  console.log(`[BOT] 🔎 Termos: casa="${termoCasa}" visit="${termoVisit}"`);

  const limite = Date.now() + 12000;
  while (Date.now() < limite) {
    // Busca elementos FOLHA (sem filhos) cujo texto contenha o nome de um dos times
    const folhas = [...document.querySelectorAll('*')]
      .filter(el => {
        if (!el.offsetParent) return false;
        if (el.children.length > 0) return false;
        const txt = norm(el.textContent.trim());
        if (txt.length < 2 || txt.length > 60) return false;
        return txt.includes(termoCasa) || txt.includes(termoVisit);
      });

    if (folhas.length > 0) {
      console.log(`[BOT] 📋 Folhas com nome de time (${folhas.length}):`,
        folhas.slice(0, 8).map(el => `"${el.textContent.trim()}" [${(el.className||'').split(' ')[0]}]`).join(' | '));

      // Prefere elementos ao vivo; depois pega o que tem o time da casa
      const aoVivo = folhas.find(el => isAoVivo(el));
      const comCasa = folhas.find(el => norm(el.textContent).includes(termoCasa));
      const alvo = aoVivo || comCasa || folhas[0];

      console.log(`[BOT] 🎯 Alvo de clique: "${alvo.textContent.trim().slice(0,50)}" [${(alvo.className||'').split(' ')[0]}]`);
      return await clicarNavegar(alvo, `"${alvo.textContent.trim()}" (${aposta.timeCasa} x ${aposta.timeVisitante})`);
    }

    await sleep(500);
  }

  console.warn('[BOT] ⚠️ Texto dos times não encontrado na lista após 12s');
  return false;
}

// ─── AGUARDA RESULTADOS APARECEREM APÓS DIGITAR ───────────────────────────────

// Filtra elementos que são resultados reais de busca (não botões "Close" ou containers vazios)
function filtrarResultadosReais(els) {
  return els.filter(el => {
    if (!el.offsetParent) return false;
    if (el.tagName === 'INPUT') return false;
    const txt = el.textContent.trim();
    // Precisa ter texto com pelo menos uma palavra longa (nome de time)
    if (txt.length < 6) return false;
    const txtLow = txt.toLowerCase();
    if (txtLow === 'close' || txtLow === 'fechar') return false;
    return true;
  });
}

async function aguardarResultados(timeCasa, timeVisitante) {
  // Aguarda obrigatório — a Bet365 faz AJAX que demora ~1-2s após a digitação
  await sleep(1500);

  const limite = Date.now() + 8000;
  while (Date.now() < limite) {
    // Verifica se qualquer elemento visível já contém texto de um dos times
    const encontrou = [...document.querySelectorAll('*')].some(el => {
      if (!el.offsetParent) return false;
      if (el.tagName === 'INPUT') return false;
      const txt = el.textContent.trim();
      if (txt.length < 4 || txt.length > 300) return false;
      return textoCorresponde(txt, timeCasa, timeVisitante);
    });
    if (encontrou) {
      console.log('[BOT] ✅ Jogo detectado na página de busca');
      return true;
    }
    await sleep(400);
  }

  console.warn('[BOT] ⏰ Timeout: jogo não apareceu na busca em 9.5s');
  // Diagnóstico: mostra todos os ssu-/sml-* para referência
  const allRes = [...document.querySelectorAll(SEL_RESULTS)];
  console.log(`[BOT] ssu-/sml-* (${allRes.length}):`,
    allRes.slice(0, 10).map(el => `"${el.textContent.trim().slice(0, 40)}" [${el.className.split(' ')[0]}]`).join(' | ')
  );
  return false;
}

// ─── ESCOLHE O RESULTADO CERTO NA PÁGINA DE BUSCA ────────────────────────────

async function clicarResultadoBusca(timeCasa, timeVisitante) {
  // Aguarda para garantir que todos os resultados da AJAX renderizaram
  await sleep(1200);

  // Pega resultados reais (filtra "Close"/vazios)
  let smlEls = filtrarResultadosReais([...document.querySelectorAll(SEL_RESULTS)]);

  console.log(`[BOT] 📋 ${smlEls.length} resultados reais visíveis`);
  console.group('[BOT] 🔬 Resultados de busca:');
  smlEls.slice(0, 20).forEach(el =>
    console.log(`  <${el.tagName.toLowerCase()} class="${el.className.trim()}"> "${el.textContent.trim().slice(0, 70)}"`)
  );
  console.groupEnd();

  const match = escolherJogo(smlEls, timeCasa, timeVisitante);
  if (match) return await clicar(match, 'resultado de busca');

  // Fallback: qualquer elemento visível com texto dos times
  console.log('[BOT] 🔍 Fallback: busca em todos os elementos visíveis com texto...');
  const todosComTexto = [...document.querySelectorAll('*')]
    .filter(el => {
      if (!el.offsetParent) return false;
      const txt = el.textContent.trim();
      return txt.length > 3 && txt.length < 300 && el.children.length <= 8;
    });

  console.log(`[BOT] 🔎 ${todosComTexto.length} elementos com texto`);

  const matchFallback = escolherJogo(todosComTexto, timeCasa, timeVisitante);
  if (matchFallback) return await clicar(matchFallback, 'resultado de busca (fallback texto)');

  // Último recurso: aguarda mais 3s e tenta uma última vez
  console.log('[BOT] ⏳ Aguardando mais 3s para resultados tardios...');
  await sleep(3000);
  const tardios = filtrarResultadosReais([...document.querySelectorAll(SEL_RESULTS)]);
  const matchTardio = escolherJogo(tardios, timeCasa, timeVisitante);
  if (matchTardio) return await clicar(matchTardio, 'resultado de busca (tardio)');

  const tardiosFallback = [...document.querySelectorAll('*')]
    .filter(el => {
      if (!el.offsetParent) return false;
      const txt = el.textContent.trim();
      return txt.length > 3 && txt.length < 300 && el.children.length <= 8;
    });
  const matchTardioFallback = escolherJogo(tardiosFallback, timeCasa, timeVisitante);
  if (matchTardioFallback) return await clicar(matchTardioFallback, 'resultado de busca (tardio fallback)');

  console.warn('[BOT] ⚠️ Jogo não encontrado nos resultados');
  return false;
}

// Escolhe o elemento MAIS ESPECÍFICO que contém os dois times
// "Mais específico" = menor textContent (item do jogo, não container com vários jogos)
function escolherJogo(candidatos, timeCasa, timeVisitante) {
  // Filtra todos que têm os dois times no texto
  const matches = candidatos.filter(el => textoCorresponde(el.textContent, timeCasa, timeVisitante));
  if (matches.length === 0) return null;

  // Ordena pelo tamanho do texto — o menor é o item mais específico (não o container)
  matches.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);

  // 1ª prioridade: menor texto E ao vivo
  const aoVivo = matches.find(el => isAoVivo(el));
  if (aoVivo) {
    console.log(`[BOT] 🎯 Jogo ao vivo: "${aoVivo.textContent.trim().slice(0, 80)}"`);
    return aoVivo;
  }

  // 2ª prioridade: menor texto (pré-live ou ao vivo sem indicador)
  const melhor = matches[0];
  console.log(`[BOT] 🎯 Jogo encontrado: "${melhor.textContent.trim().slice(0, 80)}"`);
  return melhor;
}

// Verifica se um elemento (ou seus ancestrais próximos) indica "Ao Vivo"
function isAoVivo(el) {
  // Sobe até 5 níveis para verificar se tem indicador de live
  let node = el;
  for (let i = 0; i < 5; i++) {
    if (!node) break;
    const txt = node.textContent.toLowerCase();
    const cls = (node.className || '').toLowerCase();
    if (txt.includes('ao vivo') || txt.includes('live') || cls.includes('live') || cls.includes('inplay')) return true;
    node = node.parentElement;
  }
  return false;
}

// ─── LEITURA DE STATS AO VIVO ────────────────────────────────────────────────

/**
 * Lê o total atual do jogo (escanteios ou gols) a partir do DOM da Bet365.
 *
 * @param {'escanteios'|'gols'} tipoMercado
 * @returns {Promise<number|null>} total atual (inteiro) ou null se não encontrar
 */
async function lerStatAtual(tipoMercado) {
  if (tipoMercado === 'gols') {
    return lerTotalGols();
  }
  if (tipoMercado === 'escanteios') {
    return lerTotalEscanteios();
  }
  console.warn(`[BOT] ⚠️ Tipo de mercado desconhecido para lerStatAtual: ${tipoMercado}`);
  return null;
}

/**
 * Lê o placar atual e soma os dois times para obter o total de gols.
 * Tenta múltiplos seletores em ordem de especificidade.
 */
async function lerTotalGols() {
  console.log('[BOT] 🔢 Lendo total de gols...');

  // Estratégia 1: texto do botão de mercado "Gols +/- (0-2)" → 0+2=2
  const marketBtns = [...document.querySelectorAll('[class*="sip-MarketGroupButton_Text"]')]
    .filter(el => el.offsetParent !== null);
  for (const el of marketBtns) {
    const txt = el.textContent.trim();
    if (!txt.toLowerCase().includes('gol')) continue;
    const m = txt.match(/\((\d+)-(\d+)\)/);
    if (m) {
      const total = parseInt(m[1]) + parseInt(m[2]);
      console.log(`[BOT] ⚽ Gols (market text): "${txt}" → total=${total}`);
      return total;
    }
  }

  // Seletores conhecidos da Bet365 para o placar
  const seletoresPlacar = [
    '[class*="rcl-ParticipantFixtureDetailsScore"]',
    '[class*="ipe-Score"]',
    '[class*="Score_ScoreHome"]',
    '[class*="Score_ScoreAway"]',
    '[class*="Scores_Home"]',
    '[class*="Scores_Away"]',
  ];

  // Tentativa 1: busca o elemento de placar composto (formato "2 - 1" ou "2:1")
  const seletoresCompostos = [
    '[class*="rcl-ParticipantFixtureDetailsScore"]',
    '[class*="ipe-Score_Home"] ~ [class*="ipe-Score_Away"]',
  ];

  for (const sel of seletoresCompostos) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const txt = el.textContent.trim();
      // Formato "2 - 1" ou "2:1"
      const match = txt.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (match) {
        const total = parseInt(match[1]) + parseInt(match[2]);
        console.log(`[BOT] ⚽ Gols: placar "${txt}" → total=${total} [${sel}]`);
        return total;
      }
    } catch {}
  }

  // Tentativa 2: busca elementos separados de gol (casa e visitante) e soma
  const seletoresSeparados = [
    { casa: '[class*="ipe-Score_Home"]',   visit: '[class*="ipe-Score_Away"]' },
    { casa: '[class*="Scores_Home"]',       visit: '[class*="Scores_Away"]' },
    { casa: '[class*="Score_Home"]',        visit: '[class*="Score_Away"]' },
    { casa: '[class*="HomeScore"]',         visit: '[class*="AwayScore"]' },
    { casa: '[class*="rcl-ParticipantFixtureDetailsScore_Home"]', visit: '[class*="rcl-ParticipantFixtureDetailsScore_Away"]' },
  ];

  for (const { casa, visit } of seletoresSeparados) {
    try {
      const elCasa  = document.querySelector(casa);
      const elVisit = document.querySelector(visit);
      if (!elCasa || !elVisit) continue;
      const gCasa  = parseInt(elCasa.textContent.trim());
      const gVisit = parseInt(elVisit.textContent.trim());
      if (!isNaN(gCasa) && !isNaN(gVisit)) {
        const total = gCasa + gVisit;
        console.log(`[BOT] ⚽ Gols: ${gCasa} (casa) + ${gVisit} (visit) = ${total}`);
        return total;
      }
    } catch {}
  }

  // Tentativa 3: procura qualquer par de números no formato de placar visível
  // percorre todos os elementos com texto numérico curto próximos a "vs" ou traço
  const candidatos = [...document.querySelectorAll('[class]')].filter(el => {
    if (!el.offsetParent) return false;
    const txt = el.textContent.trim();
    return /^\d+$/.test(txt) && el.children.length === 0;
  });
  console.log(`[BOT] 🔍 Candidatos numéricos visíveis (${candidatos.length}) para placar`);

  // Não conseguiu encontrar — aciona debugScan e retorna null
  console.error('[BOT] ❌ Não foi possível ler o placar de gols');
  debugScan();
  return null;
}

/**
 * Lê o total de escanteios do jogo no painel de estatísticas da Bet365.
 * Procura por label "Escanteios" ou "Corners" e lê o valor numérico adjacente.
 */
async function lerTotalEscanteios() {
  console.log('[BOT] 🔢 Lendo total de escanteios...');

  // Estratégia 1: ml1-StatsColumnAdvanced_MiniCornerWrapper (casa e visitante)
  // Estrutura: home_wrapper(value=10) + away_wrapper(value=5) → total=15
  const cornerWrappers = [...document.querySelectorAll('[class*="ml1-StatsColumnAdvanced_MiniCornerWrapper"]')]
    .filter(el => el.offsetParent !== null);
  if (cornerWrappers.length >= 2) {
    const vals = cornerWrappers.map(el => {
      const v = el.querySelector('[class*="ml1-StatsColumnAdvanced_MiniValue"]');
      return v ? parseInt(v.textContent.trim()) : NaN;
    });
    if (vals.every(v => !isNaN(v))) {
      const total = vals.reduce((s, v) => s + v, 0);
      console.log(`[BOT] 🚩 Escanteios (ml1 wrappers): ${vals.join(' + ')} = ${total}`);
      return total;
    }
  }
  if (cornerWrappers.length === 1) {
    const v = cornerWrappers[0].querySelector('[class*="ml1-StatsColumnAdvanced_MiniValue"]');
    if (v) {
      const total = parseInt(v.textContent.trim());
      console.log(`[BOT] 🚩 Escanteios (ml1 único): total=${total}`);
      return total;
    }
  }

  // Termos de busca para o label de escanteios (PT e EN)
  const termosEscanteio = ['escanteio', 'corners', 'corner'];

  // Tentativa 1: seletores de painéis de estatísticas conhecidos
  const seletoresStat = [
    '[class*="sm-Market"]',
    '[class*="sm-Stat"]',
    '[class*="sc-Stat"]',
    '[class*="Stat"]',
    '[class*="stat"]',
    '[class*="MatchStats"]',
    '[class*="matchstats"]',
  ];

  for (const sel of seletoresStat) {
    try {
      const pods = [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null);
      for (const pod of pods) {
        const txt = pod.textContent.toLowerCase();
        if (!termosEscanteio.some(t => txt.includes(t))) continue;

        // Procura números dentro deste pod
        const nums = [...pod.querySelectorAll('[class]')].filter(el => {
          const t = el.textContent.trim();
          return /^\d+$/.test(t) && el.children.length === 0 && el.offsetParent !== null;
        });

        if (nums.length === 0) continue;

        if (nums.length === 1) {
          // Já é o total
          const total = parseInt(nums[0].textContent.trim());
          console.log(`[BOT] 🚩 Escanteios: total=${total} (1 valor) [${sel}]`);
          return total;
        }

        if (nums.length >= 2) {
          // Provavelmente casa + visitante — soma
          const v1 = parseInt(nums[0].textContent.trim());
          const v2 = parseInt(nums[nums.length - 1].textContent.trim());
          if (!isNaN(v1) && !isNaN(v2)) {
            const total = v1 + v2;
            console.log(`[BOT] 🚩 Escanteios: ${v1} + ${v2} = ${total} [${sel}]`);
            return total;
          }
        }
      }
    } catch {}
  }

  // Tentativa 2: busca textual — percorre todos os elementos visíveis com texto "escanteio"/"corner"
  const todosEls = [...document.querySelectorAll('*')].filter(el => {
    if (!el.offsetParent) return false;
    const txt = el.textContent.toLowerCase().trim();
    return termosEscanteio.some(t => txt === t || txt.startsWith(t));
  });

  console.log(`[BOT] 🔍 Labels de escanteio encontrados: ${todosEls.length}`);

  for (const labelEl of todosEls) {
    // Procura o valor numérico no elemento pai ou siblings próximos
    const parent = labelEl.parentElement;
    if (!parent) continue;

    const nums = [...parent.querySelectorAll('*')].filter(el => {
      const t = el.textContent.trim();
      return /^\d+$/.test(t) && el.children.length === 0 && el.offsetParent !== null;
    });

    if (nums.length === 1) {
      const total = parseInt(nums[0].textContent.trim());
      console.log(`[BOT] 🚩 Escanteios (fallback texto): label="${labelEl.textContent.trim()}" total=${total}`);
      return total;
    }

    if (nums.length >= 2) {
      const v1 = parseInt(nums[0].textContent.trim());
      const v2 = parseInt(nums[nums.length - 1].textContent.trim());
      if (!isNaN(v1) && !isNaN(v2)) {
        const total = v1 + v2;
        console.log(`[BOT] 🚩 Escanteios (fallback texto): ${v1} + ${v2} = ${total}`);
        return total;
      }
    }
  }

  // Não conseguiu encontrar
  console.error('[BOT] ❌ Não foi possível ler o total de escanteios');
  debugScan();
  return null;
}

// ─── DIAGNÓSTICO DE MERCADO ──────────────────────────────────────────────────

// Retorna className como string (SVGAnimatedString não tem .split)
function clsStr(el) {
  const c = el.className;
  if (!c) return '';
  return typeof c === 'string' ? c : (c.baseVal || el.getAttribute('class') || '');
}

function diagnosticarMercado() {
  console.group('[BOT] 🔬 DIAGNÓSTICO — página de mercado/jogo');

  // Tabs visíveis
  const tabSels = ['[role="tab"]', '[class*="Tab"]', '[class*="tab"]'];
  const tabs = [...new Set(tabSels.flatMap(s => {
    try { return [...document.querySelectorAll(s)]; } catch { return []; }
  }))].filter(el => el.offsetParent !== null);
  console.log(`Tabs visíveis (${tabs.length}):`,
    tabs.slice(0, 20).map(el => `"${el.textContent.trim().slice(0, 30)}" [${clsStr(el).split(' ')[0]}]`).join(' | '));

  // Grupos de mercado visíveis
  const grupos = [...document.querySelectorAll('[class]')]
    .filter(el => el.offsetParent !== null && clsStr(el).toLowerCase().includes('market'));
  console.log(`\nElementos com "market" na classe (${grupos.length}):`);
  grupos.slice(0, 20).forEach(el =>
    console.log(`  [${clsStr(el).split(' ')[0]}] "${el.textContent.trim().slice(0, 60)}"`)
  );

  // Prefixos presentes na página
  const prefixos = ['ipe-', 'gl-', 'sip-', 'srb-', 'ssu-', 'bsl-'];
  const encontrados = {};
  document.querySelectorAll('[class]').forEach(el => {
    for (const cls of el.classList) {
      const p = prefixos.find(px => cls.startsWith(px));
      if (p) { encontrados[p] = encontrados[p] || new Set(); encontrados[p].add(cls); }
    }
  });
  console.log('\nPrefixos na página:');
  for (const [p, classes] of Object.entries(encontrados)) {
    console.log(`  ${p}*  →`, [...classes].slice(0, 10).join(', '));
  }

  console.groupEnd();
}

// ─── ODDS ASIÁTICAS ──────────────────────────────────────────────────────────

// Seletores de grupos de mercado (ordem de preferência: específico → genérico)
const SEL_MARKET_POD = [
  '.gl-MarketGroupPod',
  '[class*="gl-MarketGroupPod"]',
  '[class*="MarketGroupPod"]',
  '[class*="MarketGroup"]',
];

// Seletores do texto de cabeçalho do grupo de mercado
const SEL_MARKET_TITLE = [
  '.sip-MarketGroupButton_Text',
  '[class*="sip-MarketGroupButton_Text"]',
  '[class*="MarketGroupButton_Text"]',
  '[class*="MarketGroupButton"]',
  '[class*="MarketTitle"]',
  '[class*="market-title"]',
];

// Seletores dos labels de linha dentro do mercado
const SEL_LINE_LABEL = [
  '.srb-ParticipantLabelCentered_Name',
  '[class*="srb-ParticipantLabelCentered_Name"]',
  '[class*="ParticipantLabelCentered_Name"]',
  '[class*="ParticipantLabel_Name"]',
  '[class*="ParticipantName"]',
];

// Seletores de coluna de mercado
const SEL_MARKET_COL = [
  '.gl-Market',
  '[class*="gl-Market"]',
];

// Seletores de cabeçalho de coluna
const SEL_COL_HEADER = [
  '.gl-MarketColumnHeader',
  '[class*="gl-MarketColumnHeader"]',
  '[class*="MarketColumnHeader"]',
  '[class*="ColumnHeader"]',
];

// Seletores de botão de odd
const SEL_ODD_BUTTON = [
  '.gl-ParticipantOddsOnly',
  '[class*="gl-ParticipantOddsOnly"]',
  '[class*="ParticipantOddsOnly"]',
  '[class*="ParticipantOdds"]',
];

// Seletores de odd suspensa
const SEL_ODD_SUSPENDED = [
  '.gl-ParticipantOddsOnly_Suspended',
  '[class*="ParticipantOddsOnly_Suspended"]',
  '[class*="Suspended"]',
];

// Seletores do valor da odd
const SEL_ODD_VALUE = [
  '.gl-ParticipantOddsOnly_Odds',
  '[class*="gl-ParticipantOddsOnly_Odds"]',
  '[class*="ParticipantOddsOnly_Odds"]',
  '[class*="ParticipantOdds_Odds"]',
  '[class*="OddsValue"]',
];

function queryFirst(selectors, root = document) {
  for (const sel of selectors) {
    try { const el = root.querySelector(sel); if (el) return el; } catch {}
  }
  return null;
}

function queryAll(selectors, root = document) {
  for (const sel of selectors) {
    try {
      const els = [...root.querySelectorAll(sel)];
      if (els.length > 0) return els;
    } catch {}
  }
  return [];
}

// Localiza o grupo de mercado pelo texto do título (case-insensitive, trim)
function localizarGrupoMercado(mercadoAsiatico) {
  const pods = queryAll(SEL_MARKET_POD);
  console.log(`[BOT] 🔍 Pods de mercado encontrados (${pods.length})`);

  const mercadoNormBase = mercadoAsiatico.trim().toLowerCase();
  for (const pod of pods) {
    const textoEl = queryFirst(SEL_MARKET_TITLE, pod);
    if (!textoEl) continue;
    const txt = textoEl.textContent.trim().toLowerCase();
    // Match exato OU começa com o nome (ex: "Gols +/- (0-2)" começa com "gols +/-")
    if (txt === mercadoNormBase || txt.startsWith(mercadoNormBase)) {
      console.log(`[BOT] ✅ Grupo de mercado encontrado: "${textoEl.textContent.trim()}" [${pod.className.split(' ')[0]}]`);
      return pod;
    }
  }

  // Fallback: busca por texto em QUALQUER elemento visível (para CSS refatorado)
  console.log('[BOT] 🔍 Fallback: busca de mercado por texto em todos os elementos...');
  // mercadoNormBase já declarado acima
  const candidatos = [...document.querySelectorAll('[class]')].filter(el => {
    if (!el.offsetParent) return false;
    const txt = el.textContent.trim().toLowerCase();
    return (txt === mercadoNormBase || txt.startsWith(mercadoNormBase)) && el.children.length <= 2;
  });
  console.log(`[BOT] 🔍 Candidatos de mercado por texto (${candidatos.length})`);

  for (const el of candidatos) {
    // Sobe até encontrar um container que contenha botões de odd
    let node = el.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const odds = [...node.querySelectorAll('[class]')].filter(e => {
        const txt = e.textContent.trim();
        return /^\d+[.,]\d+$/.test(txt) && e.offsetParent !== null;
      });
      if (odds.length > 0) {
        console.log(`[BOT] ✅ Grupo de mercado (fallback texto): "${el.textContent.trim()}" → container [${node.className.split(' ')[0]}]`);
        return node;
      }
      node = node.parentElement;
    }
  }

  console.error(`[BOT] ❌ Mercado "${mercadoAsiatico}" não encontrado`);
  diagnosticarMercado();
  return null;
}

// Retorna o índice (0-based) da linha dentro do mercado que bate com aposta.linha
// Tenta match exato primeiro, depois match parcial (segmento de linha dupla)
function encontrarIndiceLinha(pod, linhaPedida) {
  let labels = queryAll(SEL_LINE_LABEL, pod);

  // Fallback: qualquer elemento folha com texto numérico de linha (ex: "7.5", "3,5")
  if (labels.length === 0) {
    labels = [...pod.querySelectorAll('[class]')].filter(el => {
      const txt = el.textContent.trim();
      return /^[\d.,]+$/.test(txt) && el.children.length === 0 && el.offsetParent !== null;
    });
    console.log(`[BOT] 🔍 Labels de linha (fallback numérico): ${labels.length} encontrados`);
  }

  console.log(`[BOT] 📋 ${labels.length} labels de linha:`,
    labels.slice(0, 10).map(el => `"${el.textContent.trim()}"`).join(' | '));

  // Normaliza removendo espaços extras e convertendo para lowercase
  const normalizar = s => s.trim().toLowerCase().replace(/\s+/g, '');
  const linhaNorm = normalizar(linhaPedida);

  // CA 3.4 — aviso se múltiplos matches exatos
  const matchesExatos = labels
    .map((el, i) => ({ i, txt: normalizar(el.textContent) }))
    .filter(({ txt }) => txt === linhaNorm);

  if (matchesExatos.length > 1) {
    console.warn(`[BOT] ⚠️ Ambiguidade: ${matchesExatos.length} linhas com valor "${linhaPedida}" — usando a primeira`);
  }
  if (matchesExatos.length >= 1) {
    console.log(`[BOT] ✅ Linha exata encontrada: índice ${matchesExatos[0].i}`);
    return matchesExatos[0].i;
  }

  // CA 3.2 — match parcial: a linha do DOM contém aposta.linha como segmento separado por vírgula
  for (let i = 0; i < labels.length; i++) {
    const segmentos = labels[i].textContent.split(',').map(s => normalizar(s));
    if (segmentos.includes(linhaNorm)) {
      console.log(`[BOT] ⚠️ Match parcial: "${labels[i].textContent.trim()}" contém "${linhaPedida}" — índice ${i}`);
      return i;
    }
  }

  return -1;
}

// Retorna o índice de coluna (dentro do gl-MarketGroupContainer) que corresponde
// ao cabeçalho "Mais de" ou "Menos de" (excluindo a coluna de labels, que tem &nbsp;)
// Fallback: posição 0 = mais, 1 = menos
function encontrarIndiceColuna(pod, direcao) {
  let colunas = queryAll(SEL_MARKET_COL, pod);
  if (colunas.length === 0) {
    // Fallback: qualquer div filho direto do pod que contenha botões de odd
    colunas = [...pod.children].filter(el => {
      const odds = el.querySelectorAll('[class*="Odds"]');
      return odds.length > 0;
    });
    console.log(`[BOT] 🔍 Colunas de mercado (fallback filho): ${colunas.length}`);
  }
  const direcaoNorm = direcao.trim().toLowerCase();
  const textoBuscado = direcaoNorm === 'mais' ? 'mais de' : 'menos de';

  // Filtra apenas colunas com cabeçalho real (não a de labels que tem &nbsp;)
  const colunasComHeader = colunas
    .map((col, i) => {
      const header = queryFirst(SEL_COL_HEADER, col);
      const texto = header ? header.textContent.trim().toLowerCase() : '';
      return { col, i, texto };
    })
    .filter(({ texto }) => texto && texto !== '\u00a0' && texto !== '&nbsp;');

  // Busca por texto normalizado
  const match = colunasComHeader.find(({ texto }) => texto === textoBuscado);
  if (match) {
    console.log(`[BOT] ✅ Coluna "${textoBuscado}" encontrada: índice ${match.i}`);
    return match.i;
  }

  // CA 4.4 — fallback por posição
  const indiceFallback = direcaoNorm === 'mais' ? 0 : 1;
  console.warn(`[BOT] ⚠️ Cabeçalho "${textoBuscado}" não encontrado — usando fallback posição ${indiceFallback}`);
  return indiceFallback;
}

// ─── FASE: ODDS ASIÁTICAS ─────────────────────────────────────────────────────
// Calcula a linha dinamicamente (total_atual + offset) e executa a aposta.

async function faseOddsAsiaticas(aposta) {
  await sleep(2000); // aguarda a página do jogo carregar completamente

  // Clica na aba "Odds Asiáticas" antes de tentar as odds
  const abaOk = await clicarAbaOddsAsiaticas();
  if (!abaOk) {
    limparEstado();
    await reportarResultado({ sucesso: false, erro: 'Aba "Odds Asiáticas" não encontrada', etapa: 'localizacao_mercado', ...aposta });
    return;
  }

  // Aguarda os pods de mercado renderizarem após a mudança de aba
  await sleep(1000);

  // ── PASSO 1: Determinar o tipo de stat e calcular a linha ─────────────────

  // Decide qual stat ler com base no mercado escolhido
  const tipoStat = aposta.mercadoAsiatico.toLowerCase().includes('escanteio')
    ? 'escanteios'
    : 'gols';

  // Lê o total atual do jogo na página
  const totalAtual = await lerStatAtual(tipoStat);
  if (totalAtual === null) {
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Não foi possível ler o total de ${tipoStat} na página`,
      etapa: 'leitura_stat',
      ...aposta,
    });
    return;
  }

  // Calcula a linha: total_atual + offset (ex: 7 + 0.5 = 7.5)
  const linhaCalculada = +(totalAtual + aposta.offset).toFixed(1);
  console.log(`[BOT] 🔢 ${tipoStat}: ${totalAtual} + ${aposta.offset} = ${linhaCalculada}`);

  // Enriquece o objeto de aposta com a linha calculada (string para match)
  const apostaComLinha = { ...aposta, linha: String(linhaCalculada) };

  // ── PASSO 2: Localizar o grupo de mercado correto ─────────────────────────

  const pod = localizarGrupoMercado(apostaComLinha.mercadoAsiatico);

  if (!pod) {
    console.error(`[BOT] ❌ Mercado "${apostaComLinha.mercadoAsiatico}" não encontrado`);
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Mercado '${apostaComLinha.mercadoAsiatico}' não encontrado na página`,
      etapa: 'localizacao_mercado',
      ...apostaComLinha,
    });
    return;
  }

  // Verifica se o mercado está suspenso
  if (pod.querySelector('[class*="MarketGroupButton-suspended"], [class*="MarketGroupButton_Suspended"]')) {
    console.error(`[BOT] ❌ Mercado "${apostaComLinha.mercadoAsiatico}" está suspenso`);
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Mercado '${apostaComLinha.mercadoAsiatico}' está suspenso`,
      etapa: 'localizacao_mercado',
      ...apostaComLinha,
    });
    return;
  }

  console.log(`[BOT] ✅ Mercado "${apostaComLinha.mercadoAsiatico}" localizado`);

  // ── PASSO 3: Identificar o índice da linha calculada ─────────────────────

  const indiceLinha = encontrarIndiceLinha(pod, apostaComLinha.linha);

  if (indiceLinha === -1) {
    console.error(`[BOT] ❌ Linha "${apostaComLinha.linha}" não encontrada no mercado "${apostaComLinha.mercadoAsiatico}"`);
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Linha '${apostaComLinha.linha}' não encontrada no mercado '${apostaComLinha.mercadoAsiatico}'`,
      etapa: 'selecao_linha',
      ...apostaComLinha,
    });
    return;
  }

  console.log(`[BOT] ✅ Linha "${apostaComLinha.linha}" encontrada no índice ${indiceLinha}`);

  // ── PASSO 4: Identificar a coluna correta (Mais de / Menos de) ────────────

  const indiceColuna = encontrarIndiceColuna(pod, apostaComLinha.direcao);
  const colunas = queryAll(SEL_MARKET_COL, pod);
  const coluna = colunas[indiceColuna];

  if (!coluna) {
    console.error(`[BOT] ❌ Coluna de índice ${indiceColuna} não existe no mercado (${colunas.length} colunas)`);
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Coluna para direção '${apostaComLinha.direcao}' não encontrada`,
      etapa: 'clique_odd',
      ...apostaComLinha,
    });
    return;
  }

  // ── PASSO 5: Clicar na odd correta ────────────────────────────────────────

  const botoes = queryAll(SEL_ODD_BUTTON, coluna);
  const botao = botoes[indiceLinha];

  if (!botao) {
    console.error(`[BOT] ❌ Botão de odd não encontrado: coluna ${indiceColuna}, linha ${indiceLinha} (${botoes.length} botões)`);
    diagnosticarMercado();
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Odd não encontrada para linha '${apostaComLinha.linha}' direção '${apostaComLinha.direcao}'`,
      etapa: 'clique_odd',
      ...apostaComLinha,
    });
    return;
  }

  // Odd suspensa
  const isSuspended = SEL_ODD_SUSPENDED.some(sel => {
    try { return botao.matches(sel) || !!botao.querySelector(sel); } catch { return false; }
  });
  if (isSuspended) {
    console.error(`[BOT] ❌ Odd suspensa para linha "${apostaComLinha.linha}" direção "${apostaComLinha.direcao}"`);
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: `Odd suspensa para linha '${apostaComLinha.linha}' direção '${apostaComLinha.direcao}'`,
      etapa: 'clique_odd',
      ...apostaComLinha,
    });
    return;
  }

  // Captura o valor da odd antes de clicar
  const spanOdd = queryFirst(SEL_ODD_VALUE, botao);
  const oddCapturada = spanOdd ? parseFloat(spanOdd.textContent.trim()) : null;
  apostaComLinha.oddCapturada = oddCapturada;

  console.log(`[BOT] 💹 Odd capturada: ${oddCapturada} (${apostaComLinha.mercadoAsiatico} | linha ${apostaComLinha.linha} | ${apostaComLinha.direcao})`);

  // Clica no leaf _Odds (span com o valor numérico), igual a $('.gl-ParticipantCentered_Odds').click()
  const alvoClique = spanOdd || botao;
  const clicou = await clicarCDP(alvoClique, `odd ${apostaComLinha.mercadoAsiatico} linha=${apostaComLinha.linha} ${apostaComLinha.direcao}`);
  if (!clicou) {
    limparEstado();
    await reportarResultado({
      sucesso: false,
      erro: 'Falha ao clicar na odd',
      etapa: 'clique_odd',
      ...apostaComLinha,
    });
    return;
  }

  await sleep(800);

  // ── PASSO 6: Preencher stake e confirmar ──────────────────────────────────

  const resultado = await preencherEConfirmar(apostaComLinha.valorReais, apostaComLinha.dryRun);
  limparEstado();

  await reportarResultado({
    sucesso: resultado.sucesso,
    betRef: resultado.betRef,
    odd: oddCapturada,
    linha: apostaComLinha.linha,
    etapa: 'confirmacao',
    timestamp: new Date().toISOString(),
    erro: resultado.sucesso ? undefined : 'Falha ao preencher ou confirmar a aposta',
    ...apostaComLinha,
  });

  // Volta pra home após sucesso (libera a UI pra próxima aposta)
  if (resultado.sucesso && !resultado.dryRun) {
    await sleep(1500);
    console.log('[BOT] 🏠 Aposta confirmada, voltando pra home');
    location.href = 'https://www.bet365.bet.br/#/HO/';
  }
}

// ─── STAKE / CONFIRMAR ────────────────────────────────────────────────────────

async function preencherEConfirmar(valorReais, dryRun) {
  // Seletores do betslip — prefixo real confirmado: bsl-
  const betslipSels = [
    '[class*="bsl-BetslipLoaderModule"]',
    '[class*="bsl-Betslip"]',
    '[class*="bsl-"]',
    '[class*="bsb-BetSlip"]',
    '[class*="BetSlip"]',
    '[class*="Coupon"]',
  ];

  const betslip = await waitFor(betslipSels, 8000);
  if (!betslip) {
    console.error('[BOT] ❌ Cardeneta/betslip não apareceu');
    debugScan();
    return { sucesso: false };
  }
  console.log(`[BOT] ✅ Cardeneta aberta [${betslip.className.split(' ')[0]}]`);

  // Aguarda o conteúdo interno do betslip carregar completamente
  await sleep(2000);

  // Detecta erro do Bet365 no betslip (odd rejeitada, suspensa, etc.)
  const txtBetslip = betslip.textContent.toLowerCase();
  if (txtBetslip.includes('erro ocorreu') || txtBetslip.includes('error occurred') ||
      txtBetslip.includes('ocorreu um erro') || txtBetslip.includes('erro indevido') ||
      txtBetslip.includes('contate-nos') || txtBetslip.includes('contact us')) {
    const msgErro = betslip.textContent.trim().slice(0, 120);
    const estado = carregarEstado();
    const retryCount = estado?.retryCount || 0;
    if (retryCount < 2) {
      console.warn(`[BOT] ⚠️ Erro Bet365: "${msgErro}" — retry ${retryCount + 1}/2, recarregando...`);
      salvarEstado('odds-asiaticas', estado?.aposta, retryCount + 1);
      await sleep(1500);
      location.reload();
      // location.reload() não para o JS imediatamente — sem isso o caller
      // executa limparEstado() e apaga o retry antes da página recarregar
      await new Promise(() => {});
      return { sucesso: false };
    }
    console.error(`[BOT] ❌ Erro Bet365 persistente após 2 tentativas: "${msgErro}"`);
    limparEstado();
    return { sucesso: false };
  }

  function buscarStakeInput() {
    // Bet365 usa div[contenteditable] para o stake — classe bsf-StakeBox_StakeValue-input
    const sels = [
      '[class*="bsf-StakeBox_StakeValue-input"]',
      '[class*="StakeBox_StakeValue-input"]',
      '[contenteditable="true"][placeholder]',
      '[contenteditable="true"]',
    ];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    // fallback <input> caso mude o layout
    return [...document.querySelectorAll('input')]
      .find(el => el.offsetParent !== null && el.type !== 'hidden' && el.type !== 'checkbox') || null;
  }

  let stakeInput = buscarStakeInput();

  if (!stakeInput) {
    console.log('[BOT] ⏳ Aguardando 3s para o betslip renderizar...');
    await sleep(3000);
    stakeInput = buscarStakeInput();
  }

  if (!stakeInput) {
    console.error('[BOT] ❌ Campo de valor não encontrado');
    console.log('contenteditable visíveis:', [...document.querySelectorAll('[contenteditable]')].map(
      el => `class="${el.className}" visible=${el.offsetParent !== null}`
    ));
    return { sucesso: false };
  }

  // Formata o valor: vírgula decimal (padrão Bet365 BR), sem casas desnecessárias
  const valorStr = valorReais.toFixed(2).replace('.', ',');

  // Digita no contenteditable via execCommand (único método que o React/Bet365 reconhece)
  stakeInput.focus();
  await sleep(150);
  document.execCommand('selectAll', false, null);
  await sleep(100);
  document.execCommand('insertText', false, valorStr);
  await sleep(2000);
  console.log(`[BOT] 💰 Valor: R$${valorStr}`);

  if (dryRun) {
    console.log('[BOT] 🧪 DRY RUN — parei aqui, não confirmei');
    return { sucesso: true, dryRun: true };
  }

  await sleep(2000); // aguarda antes de confirmar

  // Em live betting a odd muda constantemente — bsf-AcceptButton fica visível,
  // bsf-PlaceBetButton fica com classe Hidden. Pega o primeiro visível.
  const acceptBtn       = [...document.querySelectorAll('[class*="bsf-AcceptButton"]')]
    .find(el => el.offsetParent !== null);
  const placeBtnWrapper = [...document.querySelectorAll('[class*="bsf-PlaceBetButton_Wrapper"]')]
    .find(el => el.offsetParent !== null && !el.closest('.Hidden'));
  const confirmar = acceptBtn || placeBtnWrapper;

  if (!confirmar) { console.error('[BOT] ❌ Botão de confirmar não encontrado'); return { sucesso: false }; }

  const labelBtn = acceptBtn ? 'aceitar mudança de odd + fazer aposta' : 'fazer aposta';
  console.log(`[BOT] 🎯 Botão: ${confirmar.className.trim().split(' ')[0]} — ${labelBtn}`);

  await clicarCDP(confirmar, labelBtn);

  // Aguarda o recibo aparecer (bss-ReceiptContent contém "Aposta Feita" + Ref. BK...)
  const recibo = await waitFor([
    '[class*="bss-ReceiptContent"]',
    '[class*="ReceiptContent"]',
    '[class*="BetReceipt"]',
  ], 10000);

  if (recibo && recibo.textContent.includes('Aposta Feita')) {
    const refMatch = recibo.textContent.match(/Ref\.?\s*([A-Z0-9]+)/i);
    const betRef = refMatch ? refMatch[1] : null;
    console.log(`[BOT] ✅✅ APOSTA CONFIRMADA! ${betRef ? `Ref: ${betRef}` : ''}`);
    return { sucesso: true, betRef };
  }

  console.warn('[BOT] ⚠️ Recibo não detectado — aposta pode não ter sido feita');
  return { sucesso: false };
}

// ─── ABA ODDS ASIÁTICAS ───────────────────────────────────────────────────────

async function clicarAbaOddsAsiaticas() {
  // Seletores de tab — inclui ovm-ClassificationMarketSwitcherMenu_Item (confirmado nos logs)
  const tabSels = [
    '[class*="ovm-ClassificationMarketSwitcherMenu_Item"]',
    '[class*="ipe-GridHeaderTabLink"]',
    '[class*="GridHeaderTabLink"]',
    '[class*="GridHeaderTab"]',
    '[role="tab"]',
    '[class*="Tab_Link"]',
    '[class*="TabLink"]',
  ];

  // Aguarda pelo menos um dos seletores aparecer
  let tabsPresentes = null;
  for (const sel of tabSels) {
    tabsPresentes = await waitFor(sel, 1500);
    if (tabsPresentes) { console.log(`[BOT] 📋 Tabs via: ${sel}`); break; }
  }

  // Coleta candidatos de tab de todas as formas
  const candidatosTab = [
    ...tabSels.flatMap(sel => {
      try { return [...document.querySelectorAll(sel)]; } catch { return []; }
    }),
    // Qualquer botão/link/li visível que pareça aba de navegação
    ...[...document.querySelectorAll('button, [role="tab"], li, a')]
      .filter(el => {
        if (!el.offsetParent) return false;
        const cls = (el.className || '').toLowerCase();
        return cls.includes('tab') || cls.includes('link') || cls.includes('nav') || cls.includes('switcher');
      }),
  ];
  const tabsUnicas = [...new Set(candidatosTab)].filter(el => el.offsetParent !== null);

  console.log(`[BOT] 📋 ${tabsUnicas.length} candidatos de tab:`,
    tabsUnicas.slice(0, 20).map(el =>
      `"${el.textContent.trim().slice(0, 25)}" [${(el.className || '').split(' ')[0]}]`
    ).join(' | '));

  const normalizar = s => s.replace(/\s+/g, ' ').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const abaAsiaticas = tabsUnicas.find(el => {
    const txt = normalizar(el.textContent);
    return txt.includes('odds asiaticas') || txt.includes('asian') || txt.includes('asiaticas');
  });

  if (!abaAsiaticas) {
    console.warn('[BOT] ⚠️ Aba "Odds Asiáticas" não encontrada');
    diagnosticarMercado();
    return false;
  }

  // Se já está selecionada, não precisa clicar
  const cls = (abaAsiaticas.className || '');
  const ariaSelected = abaAsiaticas.getAttribute('aria-selected');
  if (cls.includes('selected') || ariaSelected === 'true') {
    console.log('[BOT] ✅ Aba "Odds Asiáticas" já está selecionada');
    return true;
  }

  await clicarNavegar(abaAsiaticas, 'aba Odds Asiáticas');
  await sleep(1500);
  console.log('[BOT] ✅ Aba "Odds Asiáticas" clicada, aguardando conteúdo...');
  return true;
}

// ─── DETECÇÃO DE PÁGINA ──────────────────────────────────────────────────────

// Verifica se a URL atual é uma página de jogo/evento da Bet365
// Ex: https://www.bet365.bet.br/#/IP/EV12345/ ou /#/EV12345/
function estaEmPaginaDeJogo() {
  // Qualquer rota que não seja home (#/HO/) ou in-play raiz (#/IP/ sem sufixo)
  const h = location.href;
  if (h.includes('#/HO/') || h.endsWith('#/IP/') || h.endsWith('#/IP')) return false;
  return h.includes('#/IP/') || h.includes('#/EV');
}

// ─── FLUXO PRINCIPAL ─────────────────────────────────────────────────────────

async function executarAposta(aposta) {
  console.log(`\n[BOT] ══════════════════════════════════`);
  console.log(`[BOT] 🎯 ${aposta.timeCasa} x ${aposta.timeVisitante}`);
  console.log(`[BOT] 📊 ${aposta.mercadoAsiatico} | offset=${aposta.offset} | ${aposta.direcao} | R$${aposta.valorReais}${aposta.dryRun ? ' [DRY RUN]' : ''}`);

  await faseBusca(aposta);
}

// ─── REPORTE DE RESULTADO ─────────────────────────────────────────────────────
// Aceita um objeto completo de resultado — envia via background para POST /resultado
// Campos irrelevantes (ex: oddCapturada interno) são omitidos antes do envio

function reportarResultado(resultado) {
  // Remove campos de controle interno que não devem ir no payload final
  const { oddCapturada: _ignorar, ...payload } = resultado;
  const icon = payload.sucesso ? '✅' : '❌';
  console.log(`[BOT] 📤 ${icon} etapa=${payload.etapa || '-'} | ${payload.erro || 'sucesso'}`);
  // CA 5.3 — loga o payload completo para diagnóstico
  console.log('[BOT] 📋 Payload resultado:', JSON.stringify(payload));
  // Manda pro background fazer o POST (content script não pode chamar HTTP em página HTTPS)
  chrome.runtime.sendMessage({ acao: 'resultado', payload });
}

// ─── RETOMADA APÓS NAVEGAÇÃO ──────────────────────────────────────────────────

async function verificarEstadoPendente() {
  await sleep(1500); // aguarda DOM estabilizar

  // Se já está executando uma aposta (via mensagem), não interfere
  if (executando) return;

  const estado = carregarEstado();
  if (!estado) return;

  console.log(`[BOT] 🔄 Retomando estado: fase="${estado.fase}"`);

  executando = true;
  try {
    if (estado.fase === 'odds-asiaticas') {
      await faseOddsAsiaticas(estado.aposta);
    } else {
      // busca ou busca-digitar (legado) — reinicia pelo fluxo novo
      await faseBusca(estado.aposta);
    }
  } finally {
    executando = false;
  }
}

// ─── LISTENER DE MENSAGENS ───────────────────────────────────────────────────
// Recebe do background (que faz o polling) ou do popup (teste manual)

let executando = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.acao === 'apostar' || msg.acao === 'apostar_direto') {
    sendResponse({ ok: true });
    if (executando) { console.warn('[BOT] ⚠️ Já executando uma aposta, ignorando'); return; }
    executando = true;

    const aposta = msg.aposta;
    // Sempre iniciar da home para estado limpo
    salvarEstado('busca', aposta);
    if (!location.href.includes('#/HO/')) {
      console.log('[BOT] 🏠 Indo para home antes de iniciar aposta');
      location.href = 'https://www.bet365.bet.br/#/HO/';
      // executando é resetado pelo verificarEstadoPendente na nova página
    } else {
      executarAposta(aposta)
        .catch(console.error)
        .finally(() => { executando = false; });
    }
  }
  return true;
});

// ─── HELPER DE TESTE (console) ───────────────────────────────────────────────
// Uso: await window.__botCDP('.bsf-AcceptButton')

window.__botCDP = async function(seletor) {
  const el = document.querySelector(seletor);
  if (!el) { console.error('Elemento não encontrado:', seletor); return; }
  el.scrollIntoView({ block: 'center' });
  await sleep(300);
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top  + r.height / 2);
  console.log(`CDP click em (${cx}, ${cy}) →`, el.className.trim());
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ acao: 'clicar_cdp', x: cx, y: cy }, res => {
      if (res?.ok) { console.log('✅ CDP ok'); resolve(); }
      else { console.error('❌ CDP erro:', res?.erro); reject(res?.erro); }
    });
  });
};

// ─── INIT ─────────────────────────────────────────────────────────────────────

verificarEstadoPendente(); // retoma se voltou de uma navegação
console.log('[BOT] ✅ Betting Userbot ativo');

} // fim do guard window.__betBotAtivo
