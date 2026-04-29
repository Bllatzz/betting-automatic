# Integração com Telegram (pendente)

Notificar o usuário via Telegram quando uma aposta for executada (sucesso ou falha). A integração será feita em **outro projeto**, consumindo o resultado emitido por este.

## Como o resultado chega

A extensão (`extensao/content.js`) chama `reportarResultado(payload)` ao final de toda tentativa de aposta. O payload é enviado ao background script via `chrome.runtime.sendMessage({ acao: 'resultado', payload })`, que faz `POST` no servidor bridge (`src/`, default `http://localhost:3002`).

### Campos do payload

| Campo             | Tipo    | Quando preenche                                           |
| ----------------- | ------- | --------------------------------------------------------- |
| `sucesso`         | boolean | sempre                                                    |
| `betRef`          | string  | sucesso real (ex: `BK8741309061F`) — extraído do recibo   |
| `odd`             | number  | quando a odd foi capturada antes do clique                |
| `linha`           | string  | linha calculada (ex: `7.5`)                               |
| `mercadoAsiatico` | string  | sempre (vem do request de aposta)                         |
| `direcao`         | string  | `mais` / `menos`                                          |
| `valorReais`      | number  | sempre                                                    |
| `timeCasa`        | string  | sempre                                                    |
| `timeVisitante`   | string  | sempre                                                    |
| `etapa`           | string  | última etapa atingida (`busca`, `confirmacao`, etc.)      |
| `timestamp`       | string  | ISO, presente no caminho de sucesso                       |
| `erro`            | string  | mensagem de erro quando `sucesso === false`               |

## Decisão pendente

Quando for implementar, decidir entre:

- **(a)** estender o bridge atual (`src/`) com um cliente Telegram que dispara mensagem ao receber o resultado
- **(b)** o bridge expõe os resultados (endpoint / webhook / fila) e o projeto separado consome

Provavelmente (b) — o usuário já indicou que será **outro projeto**.
