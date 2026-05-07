# Arquitetura do sistema

Resumo end-to-end de como uma aposta acontece, desde o Telegram até a Bet365.

## Fluxo completo

```
[1] Bot publica alerta no Telegram
       ↓
[2] robotip backend (fly.io: backend-spring-snow-186)
    - Listener do Telegram (gramjs)
    - Salva alerta no Postgres
    - Verifica auto_bet em bot_configs
    - Se ativo: POST {raw_message, bot_name} → BETTING_BRIDGE_URL/apostar-from-alert
       ↓
[3] Cloudflare Tunnel
    - URL pública (https://*.trycloudflare.com) → http://localhost:3002 do PC
    - Necessário pois fly.io não acessa localhost
       ↓
[4] Bridge local (este projeto, src/server.js)
    - Lookup do bot em bots-config.js
    - Resolve tipoFluxo + campos do payload
    - Enfileira aposta (max 20, expira em 5min)
       ↓
[5] Extensão Chrome (extensao/)
    - background.js faz GET /pendente a cada 2s
    - Encontra aba do bet365.bet.br
    - Injeta content.js e envia mensagem 'apostar'
       ↓
[6] Bet365 (bet365.bet.br)
    - content.js navega/clica/preenche conforme tipoFluxo
    - Reporta resultado (POST /resultado) com betRef
```

## Componentes e responsabilidades

| Componente | Onde roda | Função |
|---|---|---|
| `robotip backend` | fly.io | Recebe alertas do Telegram, decide se aciona auto-aposta |
| Cloudflare Tunnel | PC do usuário | Expõe localhost:3002 com URL pública |
| `src/server.js` | PC do usuário | Bridge HTTP — recebe apostas, mantém fila, valida payload |
| `src/parser.js` | PC do usuário | Extrai times/offset/unidades de mensagens do Telegram |
| `src/bots-config.js` | PC do usuário | Mapeia bot_name → tipoFluxo + campos do mercado |
| `extensao/background.js` | Chrome MV3 SW | Polling do bridge, inject do content, repassar resultado |
| `extensao/content.js` | Aba bet365.bet.br | Executa a aposta (navega, clica, preenche, confirma) |

## Endpoints do bridge

| Método | Rota | Origem | Função |
|---|---|---|---|
| POST | `/apostar-from-alert` | robotip (fly.io) | Recebe `{raw_message, bot_name}`, resolve via config + parser, enfileira |
| POST | `/apostar` | testes locais (`test-*.js`) | Recebe payload pré-resolvido, valida, enfileira |
| POST | `/reagendar` | extensão | Devolve aposta pra fila com delay (REAGENDAR_MS=30s) — usado quando linha não está aberta ou odd está abaixo do mínimo |
| GET | `/pendente` | extensão (a cada 2s) | Retorna próxima aposta cujo `disponivelEm <= now`, ou `{}` |
| POST | `/resultado` | extensão (após executar) | Recebe sucesso/falha + betRef |
| GET | `/status` | popup da extensão | Estado da fila (debug) |

## Tipos de fluxo (`tipoFluxo`)

Determinam qual `fase*` da extensão executa. Definidos no `bots-config.js`:

| tipoFluxo | Aba Bet365 | Mercado | Quem usa |
|---|---|---|---|
| `asiaticas` (default) | "Odds Asiáticas" | Gols +/-, Escanteios Asiáticos, 1º Tempo - Gols/Escanteios | Bots Over/Under com offset asiático |
| `escanteios_tab` | nenhuma (mesmo grid) | "Encontro - Escanteios" | Bots Under N escanteios não-asiático |
| `empate` | nenhuma (mesmo grid) | "Resultado Final" → participante "Empate" | Bot do empate |

Pra adicionar um novo `tipoFluxo` (ex: aposta condicional do Reverse BIEL), ver `docs/bots-config.md`.

## Estado e retomada (sessionStorage)

A extensão usa `sessionStorage['__bet_bot_state__']` pra sobreviver às navegações SPA do Bet365 (mudança de URL no `#/...` não recarrega o content script, mas alguns fluxos disparam `location.reload()`).

Estrutura: `{ fase, aposta, retryCount }`.

Fases registradas: `'busca'`, `'odds-asiaticas'`, `'escanteios-tab'`, `'empate'`.

Quando o content.js reaparece em uma página nova (ou após reload de retry), `verificarEstadoPendente()` lê o estado e despacha pra fase certa.

## Retry após erro do Bet365

Se o betslip mostra "ocorreu um erro" (odd mudou demais entre clique e confirmação), `preencherEConfirmar` faz até 2 retries: salva o estado com `retryCount + 1`, recarrega a página, retoma na fase original.

Após 2 retries falhos, reporta erro e abandona.

## Merge de apostas concorrentes

Quando vários bots apitam pro mesmo jogo+mercado+direção (ex: 3 bots de Over 0.5 corners), o bridge **soma** as stakes em uma única entrada da fila em vez de criar 3 apostas separadas.

Implementado em `enfileirarAposta` (`src/server.js`):
- Chave de dedup: `chaveAposta(p)` retorna `${timeCasa}|${timeVisitante}|${mercado}|${direcao}`
- Se uma aposta com a mesma chave já está na fila, mescla `valorReais += novo.valorReais` e devolve `{ merged: true, valorReais: total }`
- Se não, enfileira normal

Pro fluxo `empate`, a chave inclui só `timeCasa|timeVisitante|empate` (sem mercado/direção). Pro `escanteios_tab`, é `timeCasa|timeVisitante|esct_tab|direcao`.

Teste: `node test-over-corners-merge.js`.

## Reagendamento (espera de linha/odd)

Diferente do retry: usado quando a aposta **ainda não pode ser executada** porque alguma condição do mercado não está satisfeita.

Casos atuais:
- **Linha exata não está aberta** — ex: alvo é "1.5" mas Bet365 só mostra "1.5,2.0". Não aposta na linha dupla — espera abrir a exata.
- **Odd abaixo do mínimo** (apenas para `direcao=mais`) — ex: alerta tinha odd 2.0, Bet365 mostra 1.95. Espera subir.

Fluxo:
1. Extensão (`reagendarAposta`) → `POST /reagendar` no bridge
2. Bridge re-enfileira com `disponivelEm = now + REAGENDAR_MS` (30s) e incrementa `tentativas`
3. `GET /pendente` ignora apostas com `disponivelEm > now`
4. Após 30s a aposta volta a ser elegível e a extensão pega de novo
5. Se passar do `MAX_AGE_MS` (5 min), expira normalmente em `limparExpiradas`

A `oddMinima` é setada pelo bridge no `/apostar-from-alert` quando o parser captura odd da mensagem (linha "Gols over +0.5: 2") e a direção é `mais`. Pros testes locais (`test-*.js`), o campo é opcional.

## Variáveis de ambiente

Bridge (`.env` deste projeto):
- `PORT` — default 3002
- `STAKE` — valor de 1 unidade em R$ (default 10)
- `BRIDGE_URL` — URL deste servidor (referência interna)
- `MAX_QUEUE` — máximo de apostas pendentes simultâneas (default 20)
- `MAX_AGE_MS` — TTL de aposta na fila (default 300000 = 5 min)
- `REAGENDAR_MS` — delay quando aposta é reagendada (default 30000 = 30s)

Backend robotip (fly secrets):
- `BETTING_BRIDGE_URL` — URL do tunnel Cloudflare apontando pra este bridge

Quando o tunnel é reiniciado sem config persistente, a URL muda e precisa atualizar `BETTING_BRIDGE_URL` no fly.

## Testando o caminho completo (com config lookup)

Em vez de rodar os `test-*.js` locais (que pulam o parser), use:

```bash
curl -X POST $BRIDGE_URL/apostar-from-alert \
  -H "Content-Type: application/json" \
  -d '{
    "bot_name": "OVER 0.5 ESCANTEIOS FT - V7.0",
    "raw_message": "Oportunidade! 🚨\n\n📊 OVER 0.5 ESCANTEIOS FT - V7.0\n\n⚽ PSG x Lyon\n\n💰 1u"
  }'
```

Isso testa: parser extrai times/unidades → config resolve mercado/direção/offset → enfileira → extensão executa.
