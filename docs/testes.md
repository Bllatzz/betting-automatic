# Testes manuais da extensão

Cada arquivo `test-*.js` na raiz do projeto cobre um mercado específico. Todos seguem o mesmo padrão: payload fixo no topo do arquivo (editável), `--true` pra apostar real, sem flag = dry run.

## Pré-requisitos antes de rodar qualquer teste

1. Bridge local rodando — `npm start` (porta 3002)
2. Extensão carregada no Chrome em modo desenvolvedor (`chrome://extensions` → carregar pasta `extensao/`)
3. Bet365 aberta em uma aba (`bet365.bet.br`)
4. Time da casa/visitante editado no arquivo deve ser de jogo **ao vivo** no momento

## Arquivos disponíveis

| Arquivo | Mercado | tipoFluxo | Bots cobertos |
|---|---|---|---|
| `test-empate.js` | Empate (1X2) | `empate` | Bot vencedor 1º lugar |
| `test-over-corners.js` | Over 0.5 Corners FT | `asiaticas` | OVER 0.5 ESCANTEIOS V2/V6/V7, OVER CORNER 0.5, REVALIDAÇÃO CORNERS |
| `test-under-corners.js` | Under 0.5 Corners FT | `asiaticas` | Menos de 0,5 escanteios |
| `test-over-gols.js` | Over Gols FT (offset variável) | `asiaticas` | OVER GOL FT V1/V2 |
| `test-under-gols-ht.js` | Under 0.5 Gols HT | `asiaticas` | Bot 2º lugar, Bot 3º lugar, Teste Under Gol HT |
| `test-under-corners-tab-2-5.js` | Under 2.5 escanteios (aba não-asiática) | `escanteios_tab` | Bot 4º lugar |
| `test-under-corners-tab-3-5.js` | Under 3.5 Corners FT (aba não-asiática) | `escanteios_tab` | Under 3.5 Corners FT |
| `test-over-corners-merge.js` | **Merge** — N bots de Over 0.5 Corners no mesmo jogo | `asiaticas` | Valida que o bridge soma stakes em vez de apostar separado |

## Como editar

Cada arquivo tem um bloco "EDITE AQUI" no topo com as constantes do payload:

```js
// ─── EDITE AQUI ──────────────────────────────────────────────────────────────
const TIME_CASA      = 'Vitoria';
const TIME_VISITANTE = 'Ceara';
const VALOR_REAIS    = 0.50;
const OFFSET         = 0.5;
// ─────────────────────────────────────────────────────────────────────────────
```

## Como rodar

```bash
# Dry run — extensão navega mas NÃO confirma a aposta
node test-empate.js

# Aposta REAL
node test-empate.js --true
```

Atalhos via npm (definidos em `package.json`):

```bash
npm run test:empate
npm run test:over-corners
npm run test:over-corners -- --true   # note o `--` extra antes da flag
```

## O que rola por baixo

Cada teste manda `POST /apostar` direto pro bridge com payload pré-resolvido (pula a config lookup e o parser). Isso testa especificamente a extensão executando o fluxo, sem depender da chegada de alerta real do robotip.

Pra testar o caminho **completo** (alerta → parser → config → extensão), use `curl` em `/apostar-from-alert` com `bot_name` + `raw_message` — exemplo em `docs/arquitetura.md`.

## Acompanhando a execução

1. F12 na aba do Bet365
2. Filtrar console por `[BOT]`
3. Ver passo a passo: clique nas tabs, localização do mercado, captura da odd, preenchimento da stake, recibo

Logs do bridge (terminal do `npm start`) também úteis — mostram a fila e o resultado reportado pela extensão.

## Teste especial: merge de apostas concorrentes

`test-over-corners-merge.js` simula N bots de Over 0.5 Corners FT chegando ao mesmo tempo no mesmo jogo. Valida a regra de `chaveAposta` do bridge: apostas com mesma chave (`time|mercado|direcao`) **não viram entradas separadas na fila** — viram uma só com `valorReais` somado.

```bash
# Por padrão simula 3 bots (R$0.50 × 3 = R$1.50)
node test-over-corners-merge.js

# Aposta REAL
node test-over-corners-merge.js --true
```

Saída esperada (resumida):

```
1. "OVER 0.5 ESCANTEIOS FT - V2.0"  → { ok: true, queuePos: 1 }
2. "OVER 0.5 ESCANTEIOS FT - V6.0"  → { ok: true, merged: true, valorReais: 1.00 }
3. "OVER 0.5 ESCANTEIOS FT - V7.0"  → { ok: true, merged: true, valorReais: 1.50 }
✅ MERGE OK — valorReais=1.50 (esperado 1.50)
✅ Fila tem APENAS 1 entrada — merge funcionou.
```

Editável: `QTD_BOTS_SIMULADOS` (até 5) e `VALOR_POR_BOT`.

## Adicionar teste pra bot novo

1. Adicione o bot em `src/bots-config.js` com `tipoFluxo` correto
2. Se for um novo mercado/fluxo, **copie o teste mais próximo** e renomeie
3. Edite as constantes no topo
4. Adicione o atalho no `package.json` (opcional)

Não centralize em CLI parametrizado — a preferência aqui é arquivos fixos editáveis.
