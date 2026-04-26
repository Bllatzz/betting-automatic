// test-extensao.js — Envia uma aposta de teste direto para o servidor bridge
//
// Uso:
//   node test-extensao.js          → dry run (navega mas NÃO confirma)
//   node test-extensao.js --false  → aposta real de R$0.50

require('dotenv').config();
const fetch = require('node-fetch');

async function main() {
  const dryRun = !process.argv.includes('--false');
  const bridgeUrl  = process.env.BRIDGE_URL || 'http://localhost:3002';

  console.log('🧪 Enviando aposta de teste para o servidor bridge...\n');
  console.log(`DRY_RUN : ${dryRun ? 'SIM — extensão navega mas NÃO confirma' : 'NÃO — aposta real de R$0.50!'}`);
  console.log(`Bridge  : ${bridgeUrl}\n`);

  const payload = {
    timeCasa:        'Cienciano',
    timeVisitante:   'Deportivo Moquegua',
    mercadoAsiatico: 'Escanteios Asiáticos',
    offset:          4.5,
    direcao:         'menos',
    valorReais:      0.50,
    dryRun,
  };

  try {
    const res  = await fetch(`${bridgeUrl}/apostar`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();

    if (res.ok) {
      console.log('✅ Enviado! A extensão vai executar em até 2s.');
      console.log('   Abra o Chrome no bet365.bet.br e veja o F12 (filtrar por [BOT])');
    } else {
      console.log(`❌ Erro ${res.status}:`, json.erro || json);
      console.log('   Verifique se "npm run server" está rodando em outro terminal.');
    }
  } catch (err) {
    console.log('❌ Sem conexão com o servidor bridge:', err.message);
    console.log('   Rode "npm run server" antes de testar.');
  }
}

main().catch(console.error);
