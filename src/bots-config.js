// bots-config.js — Mapeamento de bots do robotip para mercados na Bet365.
//
// ─── COMO ADICIONAR UM BOT NOVO ───────────────────────────────────────────────
//
// 1. Pega o nome EXATO do bot (mesma string do campo bot_name no robotip,
//    e que aparece na linha "📊" do alerta).
// 2. Encontra a seção do tipoFluxo correspondente abaixo.
// 3. Adiciona uma linha com `nome:` igual ao bot.
// 4. Reinicia o servidor (`npm start` ou `./start.sh`).
//
// ─── TIPOS DE FLUXO ───────────────────────────────────────────────────────────
//
// 'asiaticas'        → aba "Odds Asiáticas". Campos: mercadoAsiatico, direcao, offset
// 'escanteios_tab'   → aba "Escanteios" / "Escanteios/Cartões". Campos: direcao, offset
// 'empate'           → mercado "Resultado Final" (1X2). Sem campos extras
//
// Campos comuns:
//   nome             → string exata do bot (case sensitive)
//   tipoFluxo        → 'asiaticas' (default) | 'escanteios_tab' | 'empate'
//   mercadoAsiatico  → para asiaticas: 'Gols +/-' | 'Escanteios Asiáticos' |
//                      '1º Tempo - Gols +/-' | '1º Tempo - Escanteios Asiáticos'
//   direcao          → 'mais' (over) | 'menos' (under)
//   offset           → número fixo (ex: 0.5) ou null para extrair do alerta
//   naoSuportado     → opcional. Se setado, o bridge rejeita com o motivo.
//
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [

  // ═══ ODDS ASIÁTICAS — ESCANTEIOS — OVER 0.5 FT ══════════════════════════════
  { nome: 'OVER 0.5 ESCANTEIOS FT - V2.0',                                   tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais',  offset: 0.5 },
  { nome: 'OVER 0.5 ESCANTEIOS FT - V6.0',                                   tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais',  offset: 0.5 },
  { nome: 'OVER 0.5 ESCANTEIOS FT - V7.0',                                   tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais',  offset: 0.5 },
  { nome: 'OVER CORNER 0.5 FT ODD MIN: 1.7 - 2.0',                           tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais',  offset: 0.5 },
  { nome: 'REVALIDAÇÃO OVER 0.5 CORNERS V2.0 (SEM FILTRO DE LIGAS) -- V1.0', tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais',  offset: 0.5 },

  // ═══ ODDS ASIÁTICAS — ESCANTEIOS — UNDER 0.5 FT ═════════════════════════════
  { nome: 'Menos de 0,5 escanteios (gratuito)',                              tipoFluxo: 'asiaticas', mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'menos', offset: 0.5 },

  // ═══ ODDS ASIÁTICAS — GOLS — OVER FT (offset variável, vem do alerta) ═══════
  { nome: 'OVER GOL FT - V1.0 @2.0',                                         tipoFluxo: 'asiaticas', mercadoAsiatico: 'Gols +/-',             direcao: 'mais',  offset: null },
  { nome: 'OVER GOL FT - V2.0 @2.0',                                         tipoFluxo: 'asiaticas', mercadoAsiatico: 'Gols +/-',             direcao: 'mais',  offset: null },

  // ═══ ODDS ASIÁTICAS — GOLS — UNDER 1º TEMPO (HT) 0.5 ════════════════════════
  { nome: 'Teste Under Gol HT',                                                          tipoFluxo: 'asiaticas', mercadoAsiatico: '1º Tempo - Gols +/-', direcao: 'menos', offset: 0.5 },
  { nome: 'Bot vencedor 2º lugar na Copa RobôTip #1: Under 0.5 HT gols',                 tipoFluxo: 'asiaticas', mercadoAsiatico: '1º Tempo - Gols +/-', direcao: 'menos', offset: 0.5 },
  { nome: 'Bot vencedor 3º lugar na Copa RobôTip #1: Under 0.5 HT gols',                 tipoFluxo: 'asiaticas', mercadoAsiatico: '1º Tempo - Gols +/-', direcao: 'menos', offset: 0.5 },

  // ═══ ABA ESCANTEIOS (NÃO-ASIÁTICA) — UNDER FT ═══════════════════════════════
  // Aposta na aba "Escanteios" / "Escanteios/Cartões" da Bet365 (não nas Odds Asiáticas).
  // A linha alvo é calculada como: total_atual_escanteios + offset.
  { nome: 'Bot vencedor 4º lugar na Copa RobôTip #1: Under 2.5 escanteios', tipoFluxo: 'escanteios_tab', direcao: 'menos', offset: 2.5 },
  { nome: 'Under 3.5 Corners FT',                                            tipoFluxo: 'escanteios_tab', direcao: 'menos', offset: 3.5 },

  // ═══ EMPATE (1X2) ═══════════════════════════════════════════════════════════
  // Aposta no X do mercado "Resultado Final" na página ao vivo do jogo.
  { nome: 'Bot vencedor 1º lugar na Copa RobôTip #1: Empate', tipoFluxo: 'empate' },

  // ═══ ⚠️  NÃO SUPORTADO — condicional por odd ════════════════════════════════
  // Reverse do BOT BIEL: só aposta se a linha for ≥ 1.5 e a odd ≥ 1.8.
  // Lógica condicional ainda não está implementada.
  { nome: 'Reverse do BOT BIEL COM ODD', naoSuportado: 'Aposta condicional (linha ≥ 1.5 e odd ≥ 1.8) ainda não implementada' },
];
