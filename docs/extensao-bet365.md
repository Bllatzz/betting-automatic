# Extensão Chrome — seletores Bet365 BR e troubleshooting

Conhecimento acumulado sobre a estrutura HTML do `bet365.bet.br` (versão BR). Útil pra entender o code de `extensao/content.js` e pra debugar quando algum seletor parar de bater.

## Prefixos de classe

A Bet365 usa prefixos consistentes pra cada área do app:

| Prefixo | Área |
|---|---|
| `gl-` | Grid de mercados, odds, colunas |
| `sip-` | Grupo de mercado (pod) — header com nome |
| `srb-` | Labels de linha (handicap), participantes nomeados (1X2) |
| `bsl-` / `bsf-` / `bss-` | Betslip / cardeneta / recibo |
| `sml-` | Search / resultados de busca |
| `ssu-` | Search alternativa (algumas variações) |
| `ipe-` | Tabs da página do jogo (Gols, Escanteios, Odds Asiáticas, etc) |
| `ovm-` | Header / classification / tab switcher de eventos ao vivo |
| `wc-` / `hm-` | Header global, search bar |
| `ml1-` | Stats column avançada (escanteios mini wrappers) |
| `mcs-` | Resultado correto (Correct Score selector) |
| `sob-` | Bet Builder badge |

## Pod de mercado (`gl-MarketGroupPod`)

Estrutura comum a quase todos os mercados:

```html
<div class="gl-MarketGroupPod sip-MarketGroup">
  <div class="sip-MarketGroupButton sip-MarketGroup_Open">
    <div class="sip-MarketGroupButton_Text">NOME DO MERCADO</div>
  </div>
  <div class="sip-MarketGroup_Info">Texto auxiliar (ex: "Nº Escanteios Marcados 4")</div>
  <div class="gl-MarketGroup_Wrapper">
    <div class="gl-MarketGroupContainer">
      <!-- 1+ <div class="gl-Market"> com colunas / linhas -->
    </div>
  </div>
</div>
```

- `sip-MarketGroup_Open` indica que o pod está expandido. Sem `_Open` = recolhido (precisa clicar pra abrir).
- `sip-MarketGroup_Info` é opcional — quando presente, costuma ter o stat atual do jogo (lido em `lerTotalEscanteiosDoPod`).

## Mercado "Resultado Final" (1X2)

```html
<div class="gl-MarketGroupPod sip-MarketGroup">
  <div class="sip-MarketGroupButton_Text">Resultado Final</div>
  ...
  <div class="srb-ParticipantResponsiveText gl-Participant_General gl-Market_General-cn3">
    <span class="srb-ParticipantResponsiveText_Name">Vitória</span>
    <span class="srb-ParticipantResponsiveText_Odds">2.10</span>
  </div>
  <div class="srb-ParticipantResponsiveText ...">
    <span class="srb-ParticipantResponsiveText_Name">Empate</span>
    <span class="srb-ParticipantResponsiveText_Odds">2.75</span>
  </div>
  <div class="srb-ParticipantResponsiveText ...">
    <span class="srb-ParticipantResponsiveText_Name">Ceará</span>
    <span class="srb-ParticipantResponsiveText_Odds">4.00</span>
  </div>
</div>
```

⚠️ **Não usa `gl-ParticipantOddsOnly`**. Usa `srb-ParticipantResponsiveText`.

Captura: nome no `_Name`, odd no `_Odds`. Clique no container `srb-ParticipantResponsiveText` (ou no span da odd).

## Mercado "Encontro - Escanteios" (não-asiático)

```html
<div class="gl-MarketGroupPod sip-MarketGroup">
  <div class="sip-MarketGroupButton_Text">Encontro - Escanteios</div>
  <div class="sip-MarketGroup_Info">Nº Escanteios Marcados 4</div>
  <div class="gl-MarketGroupContainer">
    <!-- Coluna 0: labels -->
    <div class="gl-Market gl-Market_General-haslabels gl-Market_General-pwidth25">
      <div class="gl-MarketColumnHeader">&nbsp;</div>
      <div class="srb-ParticipantLabelCentered">
        <div class="srb-ParticipantLabelCentered_Name">10</div>
      </div>
      <!-- ... 11, 12, 13, 14 -->
    </div>
    <!-- Coluna 1: Mais de -->
    <div class="gl-Market ...">
      <div class="gl-MarketColumnHeader">Mais de</div>
      <div class="gl-ParticipantOddsOnly">
        <span class="gl-ParticipantOddsOnly_Odds">1.40</span>
      </div>
      <!-- ... -->
    </div>
    <!-- Coluna 2: Exatamente -->
    <!-- Coluna 3: Menos de -->
  </div>
</div>
```

3 colunas além da de labels: **Mais de | Exatamente | Menos de**. `encontrarIndiceColuna` busca pelo header da coluna e retorna o índice na lista original (incluindo a coluna 0 de labels).

## Mercado Odds Asiáticas (Gols +/- / Escanteios Asiáticos)

Estrutura idêntica ao "Encontro - Escanteios" mas:
- Aba "Odds Asiáticas" precisa estar selecionada (clicar primeiro)
- Apenas 2 colunas de odds (sem "Exatamente"): **Mais de | Menos de**
- Labels podem ter formato `"3.5"` ou `"3.0,3.5"` (linha dupla — match parcial em `encontrarIndiceLinha`)

## Tabs da página do jogo

Encontradas via `[class*="ipe-GridHeaderTabLink"]`. Os textos típicos (BR):
- `Todos`
- `Criar Aposta`
- `Escanteios/Cartões`
- `Gols`
- `1º Tempo/2º Tempo`
- `Odds Asiáticas`
- `Apostas` (minhas apostas)

⚠️ Cada texto aparece **duplicado** nos elementos (uma vez no `_BoldText` e outra no parent). `clicarAbaOddsAsiaticas` lida com isso usando `[...new Set(...)]` e match por `textContent`.

## Recibo de aposta confirmada

Ver `docs/recibo-bet365.md`. Resumo:

- Seletor: `[class*="bss-ReceiptContent"]`
- Texto de sucesso: `Aposta Feita`
- Ref. extraída: regex `/Ref\.?\s*([A-Z0-9]+)/i` → ex `BK8741309061F`

## Erros do Bet365 no betslip

Textos no `textContent` do betslip que indicam erro recuperável:
- `erro ocorreu`
- `error occurred`
- `ocorreu um erro`
- `erro indevido`
- `contate-nos` / `contact us`

Quando algum aparece, `preencherEConfirmar` faz até 2 retries (recarrega a página, retoma estado).

## Stake input

Bet365 BR usa `div[contenteditable="true"]`, **não** `<input>`:

```html
<div class="bsf-StakeBox_StakeValue-input" contenteditable="true">10,00</div>
```

⚠️ **Métodos que NÃO funcionam:**
- `document.execCommand('insertText')` — atualiza display mas o React mantém valor default
- `Input.insertText` (CDP) — mesmo problema
- Atribuição direta + dispatch de InputEvent — React ignora

**O que funciona** (implementado em `digitarCDP` no `background.js`): digitação tecla a tecla via CDP, simulando teclado real:

1. Click no campo (`Input.dispatchMouseEvent`) pra focar
2. Ctrl+A pra selecionar tudo (`Input.dispatchKeyEvent` com modifiers=2)
3. Backspace pra apagar a seleção (alguns campos ignoram replace, então apaga explicitamente)
4. Loop por cada caractere: `keyDown` com `text` definido + `keyUp`. O Chrome dispara o keypress automaticamente quando keyDown tem `text`. Jitter aleatório de 60-120ms entre teclas.

A função `infoTecla(char)` no `background.js` mapeia chars pra `code` (`Digit0`, `Comma`, `Period`, etc) e `windowsVirtualKeyCode`. Cobre dígitos + vírgula + ponto, suficiente pra valores monetários BR.

⚠️ Se precisar suportar mais caracteres (espaço, letras, símbolos), expandir `infoTecla` no `background.js`.

## Botão de confirmar

Em apostas live, a odd muda. Aparece o botão `bsf-AcceptButton` ("Aceitar mudança e fazer aposta"). Em apostas pré-live ou estáveis, é o `bsf-PlaceBetButton_Wrapper`.

Estratégia: tenta `acceptBtn` primeiro; se não tiver visível, usa `placeBtnWrapper`.

⚠️ O clique de confirmar **precisa ser via CDP** (`isTrusted=true`). `el.click()` direto não funciona pra ações financeiras. Por isso temos `clicarCDP` no content.js que delega pro background fazer `chrome.debugger.dispatchMouseEvent`.

## Helpers de diagnóstico no content.js

Quando algum seletor não bate, esses helpers logam o estado da página:

| Função | Quando rola |
|---|---|
| `debugScan()` | Lista prefixos de classe e botões de odd visíveis |
| `diagnosticarBusca()` | Lista inputs/botões e elementos com "search" |
| `diagnosticarMercado()` | Lista tabs, mercados e prefixos da página de jogo |

Logs aparecem no F12 do Chrome (filtre por `[BOT]`). Se um teste falhar com `❌ Mercado X não encontrado`, o diagnóstico já roda automaticamente — basta colar o output ao reportar.

## Limpando estado da extensão

Se algo travar (estado do sessionStorage corrompido, retomada errada de fase), no console do Bet365:

```js
sessionStorage.clear()
```

Aí dá refresh. O `verificarEstadoPendente()` não vai achar estado e fica idle até a próxima aposta entrar.

## Padrão de query helpers

`queryFirst(selectors, root?)` e `queryAll(selectors, root?)` aceitam **arrays de seletores em ordem de preferência**. Tenta cada um e retorna o primeiro que retorna match. Útil pra resiliência quando classes do Bet365 mudam de versão.

```js
const SEL_MARKET_POD = [
  '.gl-MarketGroupPod',           // primeiro: classe canônica
  '[class*="gl-MarketGroupPod"]', // depois: variações
  '[class*="MarketGroupPod"]',
  '[class*="MarketGroup"]',       // último: super-genérico
];

const pods = queryAll(SEL_MARKET_POD);
```

## Padrão de fase (pra implementar fluxo novo)

Cada fase segue a estrutura:

1. `await sleep(N)` — aguarda página renderizar
2. (opcional) `await clicarAba...()` — se o mercado precisa de aba específica
3. `localizarPod...(...)` — acha o pod por título
4. (opcional) `lerStat...(pod)` — lê estado atual pra calcular linha
5. `encontrar...(pod, ...)` — acha o botão a clicar
6. Verifica `SEL_ODD_SUSPENDED`
7. Captura odd antes de clicar
8. `await clicarCDP(alvo, label)`
9. `await preencherEConfirmar(valorReais, dryRun)`
10. `limparEstado()` + `await reportarResultado(...)`

Se o fluxo precisa retomar após reload, `salvarEstado('nome-da-fase', aposta)` antes da navegação, e adiciona o handler em `verificarEstadoPendente()`.
