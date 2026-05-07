// test-under-gols-ht.js — Aposta UNDER 0.5 GOLS HT (Odds Asiáticas - 1º Tempo)
//
// Bots cobertos por este teste:
//   - Teste Under Gol HT
//   - Bot vencedor 2º lugar na Copa RobôTip #1: Under 0.5 HT gols
//   - Bot vencedor 3º lugar na Copa RobôTip #1: Under 0.5 HT gols
//
// Uso:
//   node test-under-gols-ht.js          → dry run
//   node test-under-gols-ht.js --true   → APOSTA REAL

require('dotenv').config();
const fetch = require('node-fetch');

// ─── EDITE AQUI ──────────────────────────────────────────────────────────────
const TIME_CASA      = 'Vitoria';
const TIME_VISITANTE = 'Ceara';
const VALOR_REAIS    = 0.50;
const OFFSET         = 0.5;
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const apostaReal = process.argv.includes('--true');
  const dryRun     = !apostaReal;
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';

  console.log('🧪 Teste UNDER 0.5 GOLS HT (asiáticas - 1º tempo)\n');
  console.log(`Times   : ${TIME_CASA} x ${TIME_VISITANTE}`);
  console.log(`Valor   : R$${VALOR_REAIS.toFixed(2)}`);
  console.log(`DRY_RUN : ${dryRun ? 'SIM (use --true pra apostar)' : '🚨 NÃO — APOSTA REAL!'}`);
  console.log(`Bridge  : ${bridgeUrl}\n`);

  const payload = {
    timeCasa:        TIME_CASA,
    timeVisitante:   TIME_VISITANTE,
    tipoFluxo:       'asiaticas',
    mercadoAsiatico: '1º Tempo - Gols +/-',
    direcao:         'menos',
    offset:          OFFSET,
    valorReais:      VALOR_REAIS,
    dryRun,
  };

  console.log('📦 Payload:', JSON.stringify(payload, null, 2), '\n');

  try {
    const res  = await fetch(`${bridgeUrl}/apostar`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.ok) {
      console.log('✅ Enviado:', json);
      console.log('   Abra o F12 na aba do Bet365 e filtre por [BOT].');
    } else {
      console.log(`❌ Erro ${res.status}:`, json.erro || json);
    }
  } catch (err) {
    console.log('❌ Sem conexão com o bridge:', err.message);
  }
}

main().catch(console.error);
