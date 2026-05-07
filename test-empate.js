// test-empate.js — Testa o fluxo de aposta no EMPATE (1X2).
//
// Uso:
//   node test-empate.js              → dry run (não confirma a aposta)
//   node test-empate.js --true       → APOSTA REAL de R$0.50
//
// Pré-requisitos:
//   1. Bridge rodando (npm start)
//   2. Extensão carregada no Chrome
//   3. Bet365 aberta em uma aba

require('dotenv').config();
const fetch = require('node-fetch');

async function main() {
  const apostaReal = process.argv.includes('--true');
  const dryRun     = !apostaReal;
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';

  console.log('🧪 Teste EMPATE (1X2)\n');
  console.log(`DRY_RUN : ${dryRun ? 'SIM — extensão navega mas NÃO confirma (use --true pra apostar)' : '🚨 NÃO — APOSTA REAL de R$0.50!'}`);
  console.log(`Bridge  : ${bridgeUrl}\n`);

  const payload = {
    timeCasa:      'Vitoria',
    timeVisitante: 'Ceara',
    tipoFluxo:     'empate',
    valorReais:    0.50,
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
      console.log('   A extensão vai executar em até 2s.');
      console.log('   Abra o F12 na aba do Bet365 e filtre por [BOT] pra ver o passo a passo.');
    } else {
      console.log(`❌ Erro ${res.status}:`, json.erro || json);
    }
  } catch (err) {
    console.log('❌ Sem conexão com o servidor bridge:', err.message);
    console.log('   Rode "npm start" antes de testar.');
  }
}

main().catch(console.error);
