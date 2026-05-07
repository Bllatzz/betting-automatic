// test-under-corners-tab-2-5.js — Aposta UNDER 2.5 ESCANTEIOS (aba "Encontro - Escanteios")
//
// Bots cobertos por este teste:
//   - Bot vencedor 4º lugar na Copa RobôTip #1: Under 2.5 escanteios
//
// Esse fluxo NÃO é Odds Asiáticas. A linha alvo é calculada como:
//   linha_alvo = total_atual_de_escanteios + offset
//
// ⚠️  Se o jogo já tiver muitos escanteios, a linha calculada pode não estar
//     disponível na Bet365 (ex: total=4 + offset=2.5 = 6.5, e a Bet365 só
//     mostra linhas 10+). Nesse caso o bot aborta com "linha não encontrada".
//
// Uso:
//   node test-under-corners-tab-2-5.js          → dry run
//   node test-under-corners-tab-2-5.js --true   → APOSTA REAL

require('dotenv').config();
const fetch = require('node-fetch');

// ─── EDITE AQUI ──────────────────────────────────────────────────────────────
const TIME_CASA      = 'Vitoria';
const TIME_VISITANTE = 'Ceara';
const VALOR_REAIS    = 0.50;
const OFFSET         = 2.5;
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const apostaReal = process.argv.includes('--true');
  const dryRun     = !apostaReal;
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';

  console.log('🧪 Teste UNDER 2.5 ESCANTEIOS (aba "Encontro - Escanteios")\n');
  console.log(`Times   : ${TIME_CASA} x ${TIME_VISITANTE}`);
  console.log(`Offset  : ${OFFSET}`);
  console.log(`Valor   : R$${VALOR_REAIS.toFixed(2)}`);
  console.log(`DRY_RUN : ${dryRun ? 'SIM (use --true pra apostar)' : '🚨 NÃO — APOSTA REAL!'}`);
  console.log(`Bridge  : ${bridgeUrl}\n`);

  const payload = {
    timeCasa:      TIME_CASA,
    timeVisitante: TIME_VISITANTE,
    tipoFluxo:     'escanteios_tab',
    direcao:       'menos',
    offset:        OFFSET,
    valorReais:    VALOR_REAIS,
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
