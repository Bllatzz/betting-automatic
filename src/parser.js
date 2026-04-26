// parser.js — Extrai dados estruturados das mensagens do Telegram
// Complementa o Gemini com parsing direto (mais rápido pro robô)

// ─── MAPEAMENTO DE MERCADOS ASIÁTICOS ────────────────────────────────────────

/**
 * Mapeia o texto do mercado (vindo da linha 📊) para o valor canônico
 * aceito pela extensão e pela validação do server.
 *
 * Retorna null se não reconhecer o mercado.
 */
function mapearMercadoAsiatico(textoMercado) {
  // Normaliza: remove Over/Under + offset do início, remove espaços extras
  // Ex: "OVER 0.5 ESCANTEIOS FT" → compara apenas a parte do mercado
  const norm = textoMercado.toUpperCase().trim();

  // Escanteios de tempo integral
  if (/ESCANTEIOS\s+(FT|FULL)/.test(norm) || /^ESCANTEIOS$/.test(norm.replace(/^(OVER|UNDER)\s+[\d.]+\s+/, ''))) {
    return 'Escanteios Asiáticos';
  }
  // Escanteios do 1º tempo
  if (/ESCANTEIOS\s+(1T|HT|HALFTIME|HALF)/.test(norm)) {
    return '1º Tempo - Escanteios Asiáticos';
  }
  // Escanteios genérico (sem sufixo de tempo = tempo integral)
  if (/ESCANTEIOS/.test(norm)) {
    // Se tem 1T/HT já foi capturado acima; aqui é FT ou sem sufixo
    if (/1T|HT/.test(norm)) return '1º Tempo - Escanteios Asiáticos';
    return 'Escanteios Asiáticos';
  }

  // Gols do 1º tempo
  if (/GOLS?\s+(1T|HT|HALFTIME|HALF)/.test(norm)) {
    return '1º Tempo - Gols +/-';
  }
  // Gols de tempo integral
  if (/GOLS?\s+(FT|FULL)/.test(norm) || /GOLS?/.test(norm)) {
    if (/1T|HT/.test(norm)) return '1º Tempo - Gols +/-';
    return 'Gols +/-';
  }

  return null;
}

/**
 * Parseia mensagem do ROBÔ
 * Exemplo:
 *   📊 OVER 0.5 ESCANTEIOS FT - V7.0
 *   ⚽️ Time A x Time B (ao vivo)
 *   https://robotip.com.br/jogo/662604093
 *   Escanteios over +0.5: 1.81
 *   Stake: 1%
 */
function parsearMensagemRobo(texto) {
  const resultado = {
    tipo: 'robo',
    mercado: null,
    mercadoAsiatico: null,
    direcao: null,
    offset: null,
    jogo: null,
    linkRobotip: null,
    linkBet365: null,
    odd: null,
    unidades: null,
    aoVivo: false,
  };

  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  for (const linha of linhas) {
    // ── Mercado (linha com 📊) ────────────────────────────────────────────────
    if (linha.includes('📊')) {
      // Ex: "📊 OVER 0.5 ESCANTEIOS FT - V7.0" → "OVER 0.5 ESCANTEIOS FT"
      const textoMercado = linha
        .replace('📊', '')
        .replace(/[-–]\s*V\d+\.?\d*/g, '') // remove versão "- V7.0"
        .trim();

      resultado.mercado = textoMercado;

      // ── Direção (Over/Under) ──────────────────────────────────────────────
      // Ex: "OVER 0.5 ESCANTEIOS FT" → "mais"
      // Ex: "UNDER 3.5 ESCANTEIOS 1T" → "menos"
      const direcaoMatch = textoMercado.match(/^(OVER|UNDER)\b/i);
      if (direcaoMatch) {
        resultado.direcao = direcaoMatch[1].toUpperCase() === 'OVER' ? 'mais' : 'menos';
      }

      // ── Offset ────────────────────────────────────────────────────────────
      // Ex: "OVER 0.5 ..." ou "UNDER 3.5 ..." → 0.5 / 3.5
      const offsetMatch = textoMercado.match(/^(?:OVER|UNDER)\s+([\d.]+)/i);
      if (offsetMatch) {
        resultado.offset = parseFloat(offsetMatch[1]);
      }

      // ── Mercado asiático mapeado ──────────────────────────────────────────
      resultado.mercadoAsiatico = mapearMercadoAsiatico(textoMercado);
    }

    // ── Jogo e ao vivo ────────────────────────────────────────────────────────
    if (linha.includes('⚽') || linha.includes('⚽️')) {
      resultado.jogo = linha.replace(/⚽️?/, '').replace('(ao vivo)', '').trim();
      resultado.aoVivo = linha.toLowerCase().includes('ao vivo');
    }

    // ── Link do robotip ───────────────────────────────────────────────────────
    if (linha.includes('robotip.com.br')) {
      resultado.linkRobotip = linha.trim();
    }

    // ── Link da Bet365 ────────────────────────────────────────────────────────
    if (linha.toLowerCase().includes('bet365') && linha.includes('http')) {
      resultado.linkBet365 = linha.trim();
    }
    // "Bet365" como texto simples seguido de link na próxima linha
    if (linha === 'Bet365' || linha === 'bet365') {
      const idx = linhas.indexOf(linha);
      const proxima = linhas[idx + 1];
      if (proxima && proxima.startsWith('http')) {
        resultado.linkBet365 = proxima.trim();
      }
    }

    // ── Odd da aposta ─────────────────────────────────────────────────────────
    // Ex: "Escanteios over +0.5: 1.81"
    const oddMatch = linha.match(/:\s*(\d+[.,]\d+)\s*$/);
    if (oddMatch && !resultado.odd && !linha.toLowerCase().includes('stake')) {
      resultado.odd = parseFloat(oddMatch[1].replace(',', '.'));
    }

    // ── Fallback: extrai direção e offset da linha de detalhe ─────────────────
    // Ex: "Escanteios over +0.5: 1.81" ou "Gols under +2.5: 1.75"
    // Útil quando a linha 📊 não traz esses dados
    if (!resultado.direcao || resultado.offset === null) {
      const detalheDirecaoMatch = linha.match(/\b(over|under)\s+\+?([\d.]+)\s*:/i);
      if (detalheDirecaoMatch) {
        if (!resultado.direcao) {
          resultado.direcao = detalheDirecaoMatch[1].toUpperCase() === 'OVER' ? 'mais' : 'menos';
        }
        if (resultado.offset === null) {
          resultado.offset = parseFloat(detalheDirecaoMatch[2]);
        }
      }
    }

    // ── Stake ─────────────────────────────────────────────────────────────────
    // Ex: "Stake: 1%" ou "Stake: 0.5u"
    const stakeMatch = linha.match(/stake[:\s]+(\d+[.,]?\d*)\s*(%|u)?/i);
    if (stakeMatch) {
      resultado.unidades = parseFloat(stakeMatch[1].replace(',', '.'));
    }
  }

  return resultado;
}

/**
 * Parseia mensagem dos GRUPOS VIP
 * Exemplo:
 *   [Imagem]
 *   Bingo odd 6
 *   0,5 unidade!
 *   Link pronto
 *   https://bet365.com/...
 */
function parsearMensagemVIP(texto, temImagem = false) {
  const resultado = {
    tipo: 'vip',
    linkBet365: null,
    unidades: null,
    descricao: texto,
    temImagem,
  };

  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  for (const linha of linhas) {
    // Link da Bet365
    if (linha.includes('bet365.com') || linha.includes('365.com')) {
      resultado.linkBet365 = linha.trim();
    }

    // Unidades — vários formatos possíveis
    // "0,5 unidade", "1 unit", "2u", "0.5u"
    const unitMatch = linha.match(/(\d+[.,]?\d*)\s*(unidade|unit|u\b)/i);
    if (unitMatch) {
      resultado.unidades = parseFloat(unitMatch[1].replace(',', '.'));
    }

    // "% unidade" estilo "0,5 unidade!"
    const unitMatch2 = linha.match(/(\d+[.,]\d+)\s*unidade/i);
    if (unitMatch2) {
      resultado.unidades = parseFloat(unitMatch2[1].replace(',', '.'));
    }
  }

  // Default: se não achou unidades, assume 1u
  if (!resultado.unidades) resultado.unidades = 1;

  return resultado;
}

/**
 * Detecta automaticamente se é mensagem do robô ou VIP
 */
function parsearMensagem(texto, temImagem = false) {
  if (!texto) return null;

  // Robô tem padrão específico
  if (
    texto.includes('robotip.com.br') ||
    texto.includes('Oportunidade! 🚨') ||
    (texto.includes('📊') && texto.includes('Stake:'))
  ) {
    return parsearMensagemRobo(texto);
  }

  // VIP tem link direto da Bet365
  if (texto.includes('bet365.com') || temImagem) {
    return parsearMensagemVIP(texto, temImagem);
  }

  return null;
}

module.exports = { parsearMensagem, parsearMensagemRobo, parsearMensagemVIP };
