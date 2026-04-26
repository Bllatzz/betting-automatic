// server.js — Bridge local entre o bot do Telegram e a extensão
//
// A extensão faz polling em GET /pendente a cada 2s
// O bot envia apostas via POST /apostar
//
// Uso: node server.js

const http = require('http');
const { parsearMensagem } = require('./parser');

const PORT       = process.env.PORT       || 3002;
const MAX_QUEUE  = parseInt(process.env.MAX_QUEUE  || '20');
const MAX_AGE_MS = parseInt(process.env.MAX_AGE_MS || '300000'); // 5 minutos

let apostasQueue = [];  // fila de apostas pendentes
let ultimaAposta = null;

// ─── CHAVE DE DEDUPLICAÇÃO ────────────────────────────────────────────────────

function chaveAposta(p) {
  return `${p.timeCasa}|${p.timeVisitante}|${p.mercadoAsiatico}|${p.direcao}`.toLowerCase();
}

// Remove apostas expiradas da fila
function limparExpiradas() {
  const agora = Date.now();
  const antes = apostasQueue.length;
  apostasQueue = apostasQueue.filter(a => {
    const expirada = (agora - a.queuedAt) > MAX_AGE_MS;
    if (expirada) console.log(`[SERVER] ⏰ Aposta expirada e descartada: ${a.timeCasa} x ${a.timeVisitante} (ficou ${Math.round((agora - a.queuedAt) / 1000)}s na fila)`);
    return !expirada;
  });
  return antes - apostasQueue.length;
}

// ─── VALIDAÇÃO DO PAYLOAD ─────────────────────────────────────────────────────

const MERCADOS_VALIDOS = [
  'Gols +/-',
  'Escanteios Asiáticos',
  '1º Tempo - Gols +/-',
  '1º Tempo - Escanteios Asiáticos',
];

function validarPayloadAposta(body) {
  const camposObrigatorios = ['timeCasa', 'timeVisitante', 'mercadoAsiatico', 'offset', 'direcao', 'valorReais'];
  for (const campo of camposObrigatorios) {
    if (body[campo] === undefined || body[campo] === null || body[campo] === '') {
      return `Campo obrigatório ausente ou vazio: "${campo}"`;
    }
  }

  const mercadoNorm = body.mercadoAsiatico.trim().toLowerCase();
  const mercadoOk = MERCADOS_VALIDOS.some(m => m.toLowerCase() === mercadoNorm);
  if (!mercadoOk) {
    return `Mercado inválido: "${body.mercadoAsiatico}". Valores aceitos: ${MERCADOS_VALIDOS.join(', ')}`;
  }

  const offsetVal = parseFloat(body.offset);
  if (isNaN(offsetVal) || offsetVal < 0) {
    return `Offset inválido: "${body.offset}". Deve ser um número >= 0 (ex: 0.5, 3.5)`;
  }

  const direcaoNorm = body.direcao.trim().toLowerCase();
  if (direcaoNorm !== 'mais' && direcaoNorm !== 'menos') {
    return `Direção inválida: "${body.direcao}". Valores aceitos: "mais", "menos"`;
  }

  return null;
}

// ─── HELPER: ENFILEIRA OU MESCLA APOSTA ──────────────────────────────────────

function enfileirarAposta(payload, res) {
  limparExpiradas();

  const chave = chaveAposta(payload);

  // Mesmo jogo+mercado+direção já na fila → mescla stakes
  const existente = apostasQueue.find(a => chaveAposta(a) === chave);
  if (existente) {
    const antes = existente.valorReais;
    existente.valorReais = +(antes + payload.valorReais).toFixed(2);
    console.log(`[SERVER] 🔀 Mesclado na fila [pos ${apostasQueue.indexOf(existente) + 1}/${apostasQueue.length}]: R$${antes.toFixed(2)} + R$${payload.valorReais.toFixed(2)} = R$${existente.valorReais.toFixed(2)}`);
    return json(res, 200, { ok: true, id: existente.id, merged: true, valorReais: existente.valorReais, queuePos: apostasQueue.indexOf(existente) + 1 });
  }

  if (apostasQueue.length >= MAX_QUEUE) {
    console.warn(`[SERVER] ⛔ Fila cheia (${MAX_QUEUE}). Aposta rejeitada: ${payload.timeCasa} x ${payload.timeVisitante}`);
    return json(res, 503, { ok: false, erro: `Fila cheia (${MAX_QUEUE} apostas). Tente novamente em instantes.` });
  }

  const aposta = { ...payload, id: Date.now().toString(), queuedAt: Date.now() };
  apostasQueue.push(aposta);
  const pos = apostasQueue.length;
  console.log(`[SERVER] 📨 Enfileirada [${pos}/${apostasQueue.length}]: ${payload.timeCasa} x ${payload.timeVisitante} | ${payload.mercadoAsiatico} | offset=${payload.offset} | ${payload.direcao} | R$${payload.valorReais.toFixed(2)}`);
  return json(res, 200, { ok: true, id: aposta.id, queuePos: pos });
}

// ─── ROTEADOR ─────────────────────────────────────────────────────────────────

const rotas = {

  // Bot envia a aposta aqui
  'POST /apostar': (body, res) => {
    const erroValidacao = validarPayloadAposta(body);
    if (erroValidacao) {
      console.warn(`[SERVER] ⚠️ Payload inválido: ${erroValidacao}`);
      return json(res, 400, { ok: false, erro: erroValidacao });
    }
    enfileirarAposta(body, res);
  },

  // Robotip envia alerta bruto para auto-aposta
  'POST /apostar-from-alert': (body, res) => {
    const { raw_message } = body;

    if (!raw_message) {
      return json(res, 400, { ok: false, erro: 'Campo "raw_message" é obrigatório' });
    }

    const parsed = parsearMensagem(raw_message, false);
    if (!parsed) {
      return json(res, 400, { ok: false, erro: 'Não foi possível parsear a mensagem' });
    }

    const { mercadoAsiatico, offset, direcao, unidades, jogo } = parsed;

    if (!mercadoAsiatico) {
      return json(res, 400, { ok: false, erro: 'Mercado asiático não reconhecido na mensagem' });
    }

    const mercadoNorm = mercadoAsiatico.trim().toLowerCase();
    const mercadoOk = MERCADOS_VALIDOS.some(m => m.toLowerCase() === mercadoNorm);
    if (!mercadoOk) {
      return json(res, 400, { ok: false, erro: `Mercado inválido: "${mercadoAsiatico}". Valores aceitos: ${MERCADOS_VALIDOS.join(', ')}` });
    }

    let timeCasa = '';
    let timeVisitante = '';
    if (jogo) {
      const partes = jogo.split(/\s+x\s+/i);
      timeCasa      = (partes[0] || '').trim();
      timeVisitante = (partes[1] || '').trim();
    }

    if (!timeCasa || !timeVisitante) {
      return json(res, 400, { ok: false, erro: 'Não foi possível extrair os times da mensagem' });
    }

    if (offset === null || offset === undefined) {
      return json(res, 400, { ok: false, erro: 'Offset não encontrado na mensagem' });
    }

    if (!direcao) {
      return json(res, 400, { ok: false, erro: 'Direção (over/under) não encontrada na mensagem' });
    }

    const valorReais = parseFloat(process.env.STAKE || '10') * (unidades || 1);
    const payload = { timeCasa, timeVisitante, mercadoAsiatico, offset, direcao, valorReais };

    enfileirarAposta(payload, res);
  },

  // Extensão busca próxima aposta da fila (polling)
  'GET /pendente': (_body, res) => {
    limparExpiradas();

    if (apostasQueue.length === 0) {
      return json(res, 200, {});
    }

    const aposta = apostasQueue.shift();
    const esperouMs = Date.now() - aposta.queuedAt;
    console.log(`[SERVER] 📡 Enviando para extensão: ${aposta.timeCasa} x ${aposta.timeVisitante} | R$${aposta.valorReais.toFixed(2)} | esperou ${Math.round(esperouMs / 1000)}s | restam ${apostasQueue.length} na fila`);
    json(res, 200, aposta);
  },

  // Extensão reporta resultado
  'POST /resultado': (body, res) => {
    ultimaAposta = body;
    const icone = body.sucesso ? '✅' : (body.abortado ? '⏭' : '❌');
    const msg = body.sucesso ? 'sucesso' : (body.abortado ? `abortado: ${body.motivo}` : body.erro);
    console.log(`[SERVER] ${icone} Resultado: ${msg} | fila restante: ${apostasQueue.length}`);
    json(res, 200, { ok: true });
  },

  // Popup verifica status
  'GET /status': (_body, res) => {
    limparExpiradas();
    json(res, 200, {
      ok: true,
      filaTamanho: apostasQueue.length,
      fila: apostasQueue.map(a => ({
        id: a.id,
        jogo: `${a.timeCasa} x ${a.timeVisitante}`,
        mercado: a.mercadoAsiatico,
        direcao: a.direcao,
        valorReais: a.valorReais,
        esperandoHa: Math.round((Date.now() - a.queuedAt) / 1000) + 's',
      })),
      ultimaAposta,
    });
  },
};

// ─── HTTP ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const chave = `${req.method} ${req.url.split('?')[0]}`;
  const handler = rotas[chave];

  if (!handler) { res.writeHead(404); res.end(); return; }

  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    try {
      handler(body ? JSON.parse(body) : {}, res);
    } catch (e) {
      json(res, 400, { ok: false, erro: e.message });
    }
  });
});

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

server.listen(PORT, () => {
  console.log(`\n[SERVER] 🚀 Bridge local em http://localhost:${PORT}`);
  console.log(`[SERVER] POST /apostar            → recebe aposta do bot`);
  console.log(`[SERVER] POST /apostar-from-alert → recebe alerta bruto (robotip)`);
  console.log(`[SERVER] GET  /pendente           → extensão busca próxima da fila`);
  console.log(`[SERVER] POST /resultado          → extensão reporta resultado`);
  console.log(`[SERVER] GET  /status             → estado da fila`);
  console.log(`[SERVER] 📋 Fila ativa: até ${MAX_QUEUE} apostas | expiram em ${MAX_AGE_MS / 60000} min\n`);
});
