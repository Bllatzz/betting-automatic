# Gerenciando bots em `src/bots-config.js`

Cada entrada do array em `bots-config.js` mapeia um bot do robotip pra um mercado específico na Bet365. O bridge usa `bot_name` (vindo do payload do robotip) como chave de lookup.

## Schema de uma entrada

```js
{
  nome: 'OVER 0.5 ESCANTEIOS FT - V7.0',  // string EXATA do bot_name
  tipoFluxo: 'asiaticas',                  // 'asiaticas' (default) | 'escanteios_tab' | 'empate'
  mercadoAsiatico: 'Escanteios Asiáticos', // só p/ tipoFluxo='asiaticas'
  direcao: 'mais',                         // 'mais' (over) | 'menos' (under)
  offset: 0.5,                             // número fixo OU null (extrai do alerta)
  // naoSuportado: 'motivo'                // se setado, bridge rejeita com 400
}
```

## Tipos de fluxo

### `asiaticas` (default)
Aba "Odds Asiáticas" da Bet365. Calcula linha alvo como `total_atual + offset`.

Mercados válidos (`MERCADOS_VALIDOS` em `server.js`):
- `Gols +/-`
- `Escanteios Asiáticos`
- `1º Tempo - Gols +/-`
- `1º Tempo - Escanteios Asiáticos`

Campos obrigatórios: `mercadoAsiatico`, `direcao`, `offset`.

### `escanteios_tab`
Mercado "Encontro - Escanteios" (não asiático). Mesmo cálculo de linha (`total_atual + offset`), mas no pod com colunas `Mais de | Exatamente | Menos de`.

Campos obrigatórios: `direcao`, `offset`.

### `empate`
Pod "Resultado Final" (1X2). Clica direto no participante chamado "Empate".

Sem campos extras — não precisa de `direcao`/`offset`/`mercadoAsiatico`.

## Adicionar bot novo (passo a passo)

1. Identifica o `bot_name` exato (que aparece no campo `bot_configs.bot_name` no Postgres do robotip e na linha 📊 do alerta).
2. Decide o `tipoFluxo` baseado em onde o bot aposta na Bet365.
3. Adiciona uma linha na seção correspondente do `bots-config.js`. Exemplo:

```js
// Em ESCANTEIOS ASIÁTICOS — OVER 0.5 FT
{ nome: 'NOVO BOT OVER CORNERS V3.0', tipoFluxo: 'asiaticas',
  mercadoAsiatico: 'Escanteios Asiáticos', direcao: 'mais', offset: 0.5 },
```

4. Reinicia o bridge: `lsof -ti :3002 | xargs kill && npm start &`
5. (Opcional) Cria teste seguindo `docs/testes.md`.

## Quando o `bot_name` não está na config

`server.js` cai no parser (`parsearMensagem` em `src/parser.js`) como fallback. O parser tenta extrair `mercadoAsiatico`, `direcao`, `offset` da mensagem bruta — funciona pra mensagens com formato padrão "OVER N ESCANTEIOS/GOLS FT/HT" mas falha em bots com nomes não-padrão (ex: "Bot vencedor 2º lugar...: Under 0.5 HT gols").

O log do bridge avisa: `⚠️ Bot "..." não está em bots-config.js — caindo no parser como fallback`. Sempre que aparecer essa mensagem, é sinal pra registrar o bot na config.

## Marcando bot como não suportado

```js
{ nome: 'Reverse do BOT BIEL COM ODD',
  naoSuportado: 'Aposta condicional (linha ≥ 1.5 e odd ≥ 1.8) ainda não implementada' },
```

Bridge devolve 400 com a mensagem do `naoSuportado`. Útil pra deixar registrado bots conhecidos que precisam de implementação extra (novo `tipoFluxo`, lógica condicional, etc) sem deixar a aposta passar erroneamente pelo parser.

## Quando precisa de novo `tipoFluxo`

Se um bot exige um fluxo diferente dos 3 atuais (ex: condicional por odd, mercado novo da Bet365, página diferente), tem que:

1. Adicionar handler de validação em `server.js` (no `POST /apostar-from-alert` e em `validarPayloadAposta`)
2. Adicionar campo `tipoFluxo` correspondente em `bots-config.js`
3. Implementar `faseXxx` em `extensao/content.js` seguindo o padrão de `faseEmpate`/`faseEscanteiosTab`
4. Adicionar dispatch em `executarAposta` e `verificarEstadoPendente` no content.js
5. Atualizar `chaveAposta()` no `server.js` se a chave de dedup precisar de campos diferentes

Ver `docs/extensao-bet365.md` pros seletores HTML conhecidos.
