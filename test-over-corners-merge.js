// test-over-corners-merge.js — Simula 3 bots de OVER 0.5 ESCANTEIOS FT apitando
// ao mesmo tempo no MESMO jogo. Espera que o bridge mescle as apostas em UMA só
// com o valor total somado (regra de chaveAposta = time|mercado|direcao).
//
// Resultado esperado: a extensão executa UMA aposta de R$ (3 × VALOR_POR_BOT)
// em vez de 3 apostas separadas.
//
// Uso:
//   node test-over-corners-merge.js          → dry run
//   node test-over-corners-merge.js --true   → APOSTA REAL

require('dotenv').config();
const fetch = require('node-fetch');

// ─── EDITE AQUI ──────────────────────────────────────────────────────────────
const TIME_CASA          = 'Juventude';
const TIME_VISITANTE     = 'Tombense';
const VALOR_POR_BOT      = 0.50;
const OFFSET             = 0.5;
const QTD_BOTS_SIMULADOS = 5;   // 3 bots → R$1.50 total
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const apostaReal = process.argv.includes('--true');
  const dryRun     = !apostaReal;
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';
  const valorTotal = +(VALOR_POR_BOT * QTD_BOTS_SIMULADOS).toFixed(2);

  console.log(`🧪 Teste MERGE — ${QTD_BOTS_SIMULADOS} bots de OVER 0.5 ESCANTEIOS FT no mesmo jogo\n`);
  console.log(`Times      : ${TIME_CASA} x ${TIME_VISITANTE}`);
  console.log(`Por bot    : R$${VALOR_POR_BOT.toFixed(2)}`);
  console.log(`Total esp. : R$${valorTotal.toFixed(2)} (${QTD_BOTS_SIMULADOS} × ${VALOR_POR_BOT})`);
  console.log(`DRY_RUN    : ${dryRun ? 'SIM (use --true pra apostar)' : '🚨 NÃO — APOSTA REAL!'}`);
  console.log(`Bridge     : ${bridgeUrl}\n`);

  // Cada "bot" tem o mesmo mercado/direção/offset — o nome muda só pra deixar
  // claro no log que são apostas distintas chegando.
  const nomesBots = [
    'OVER 0.5 ESCANTEIOS FT - V2.0',
    'OVER 0.5 ESCANTEIOS FT - V6.0',
    'OVER 0.5 ESCANTEIOS FT - V7.0',
    'OVER CORNER 0.5 FT ODD MIN: 1.7 - 2.0',
    'REVALIDAÇÃO OVER 0.5 CORNERS V2.0 (SEM FILTRO DE LIGAS) -- V1.0',
  ].slice(0, QTD_BOTS_SIMULADOS);

  const payloads = nomesBots.map(() => ({
    timeCasa:        TIME_CASA,
    timeVisitante:   TIME_VISITANTE,
    tipoFluxo:       'asiaticas',
    mercadoAsiatico: 'Escanteios Asiáticos',
    direcao:         'mais',
    offset:          OFFSET,
    valorReais:      VALOR_POR_BOT,
    dryRun,
  }));

  // Manda os N em paralelo
  const respostas = await Promise.all(payloads.map((p, i) =>
    fetch(`${bridgeUrl}/apostar`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(p),
    })
      .then(async r => ({ bot: nomesBots[i], status: r.status, body: await r.json() }))
      .catch(e => ({ bot: nomesBots[i], erro: e.message }))
  ));

  console.log('━━━ Respostas do bridge ━━━');
  respostas.forEach(({ bot, status, body, erro }, i) => {
    console.log(`\n${i + 1}. "${bot}"`);
    if (erro) { console.log(`   ❌ ${erro}`); return; }
    console.log(`   HTTP ${status}`);
    console.log(`   ${JSON.stringify(body)}`);
  });

  console.log('\n━━━ Análise ━━━');
  const ultimo = respostas[respostas.length - 1]?.body;
  if (ultimo?.merged && ultimo?.valorReais === valorTotal) {
    console.log(`✅ MERGE OK — última resposta retornou valorReais=${ultimo.valorReais} (esperado ${valorTotal})`);
  } else if (ultimo?.merged) {
    console.log(`⚠️  Merge aconteceu mas valor inesperado: got ${ultimo.valorReais}, esperado ${valorTotal}`);
  } else {
    console.log(`❌ Merge NÃO aconteceu — última resposta: ${JSON.stringify(ultimo)}`);
    console.log('   A fila provavelmente tem múltiplas entradas. Verifique GET /status.');
  }

  // Confirma na fila
  try {
    const statusRes = await fetch(`${bridgeUrl}/status`);
    const status = await statusRes.json();
    console.log(`\n━━━ Estado da fila (GET /status) ━━━`);
    console.log(`   filaTamanho: ${status.filaTamanho}`);
    if (status.fila?.length) {
      status.fila.forEach((a, i) => console.log(`   [${i + 1}] ${a.jogo} | ${a.mercado} ${a.direcao} | R$${a.valorReais.toFixed(2)} (esperando ha ${a.esperandoHa})`));
    }
    if (status.filaTamanho === 1) console.log('\n✅ Fila tem APENAS 1 entrada — merge funcionou.');
    else console.log(`\n⚠️  Fila tem ${status.filaTamanho} entradas — merge falhou ou outras apostas estão na fila.`);
  } catch (e) {
    console.log(`(não foi possível consultar /status: ${e.message})`);
  }

  console.log('\nA extensão deve agora executar UMA aposta de R$' + valorTotal.toFixed(2) + '.');
  console.log('F12 na aba do Bet365, filtra por [BOT] pra acompanhar.');
}

main().catch(console.error);
