# Recibo de aposta Bet365

Estrutura do DOM exibido pelo Bet365 quando uma aposta é confirmada com sucesso (bet365.bet.br).

## HTML observado

```html
<div class="bss-ReceiptContent bss-ReceiptContent-ReceiptContent-noanimation">
  <div class="bss-ReceiptContent_TickWrapper">
    <div class="bss-ReceiptContent_Tick"></div>
  </div>
  <div class="bss-ReceiptContent_TitleWrapper">
    <div class="bss-ReceiptContent_Title">Aposta Feita</div>
    <div class="bss-ReceiptContent_BetRef">Ref. BK8741309061F</div>
  </div>
  <div class="bss-ReceiptContent_Done">Terminar</div>
</div>
```

## Detecção (em `extensao/content.js` → `preencherEConfirmar`)

- **Seletor:** `[class*="bss-ReceiptContent"]` (com `[class*="ReceiptContent"]` e `[class*="BetReceipt"]` como fallback)
- **Confirmação:** `textContent.includes('Aposta Feita')` — se o site mudar o locale para inglês, considerar `'Bet Placed'`
- **Extração da referência:** regex `/Ref\.?\s*([A-Z0-9]+)/i` → captura `BK8741309061F`
- **Formato observado:** `BK` + dígitos + letra (exemplo único — confirmar com mais amostras)

A `betRef` é propagada no payload de `reportarResultado` e usada para rastrear a aposta nas integrações externas (ex: Telegram).
