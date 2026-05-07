// test-over-gols.js — Aposta OVER GOLS FT (Odds Asiáticas)
//
// Bots cobertos por este teste:
//   - OVER GOL FT - V1.0 @2.0
//   - OVER GOL FT - V2.0 @2.0
//
// ⚠️  Pra esses bots o offset varia por jogo (vem do alerta).
//     Edite o OFFSET abaixo conforme o caso.
//
// Uso:
//   node test-over-gols.js          → dry run
//   node test-over-gols.js --true   → APOSTA REAL

require('dotenv').config();
const fetch = require('node-fetch');

// ─── EDITE AQUI ──────────────────────────────────────────────────────────────
const TIME_CASA      = 'Volta Redonda';
const TIME_VISITANTE = 'Novorizontino';
const VALOR_REAIS    = 0.50;
const OFFSET         = 0.5;   // ← varia por jogo (1.5, 2.5, 3.5, etc)
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const apostaReal = process.argv.includes('--true');
  const dryRun     = !apostaReal;
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';

  console.log('🧪 Teste OVER GOLS FT (asiáticas)\n');
  console.log(`Times   : ${TIME_CASA} x ${TIME_VISITANTE}`);
  console.log(`Offset  : ${OFFSET}`);
  console.log(`Valor   : R$${VALOR_REAIS.toFixed(2)}`);
  console.log(`DRY_RUN : ${dryRun ? 'SIM (use --true pra apostar)' : '🚨 NÃO — APOSTA REAL!'}`);
  console.log(`Bridge  : ${bridgeUrl}\n`);

  const payload = {
    timeCasa:        TIME_CASA,
    timeVisitante:   TIME_VISITANTE,
    tipoFluxo:       'asiaticas',
    mercadoAsiatico: 'Gols +/-',
    direcao:         'mais',
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
