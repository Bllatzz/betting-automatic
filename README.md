# betting-userbot

Servidor bridge + extensão Chrome que executa apostas automáticas na **Bet365**, acionado pelo [robotip](../robotip).

---

## Como funciona

```
robotip (recebe alerta do Telegram)
  └─► verifica se o bot está validado para auto-aposta
        └─► POST /apostar-from-alert  ──►  src/server.js  (porta 3002)
                                               └─► extensão Chrome (polling a cada 2s)
                                                     └─► executa aposta na Bet365
```

O **robotip** cuida de todo o Telegram. Este projeto é apenas o servidor bridge e a extensão — sem listener próprio, sem Firebase, sem Gemini.

---

## Pré-requisitos

- Node.js 18+
- Chrome com a extensão carregada em modo desenvolvedor
- Bet365 aberta em alguma aba do Chrome
- Robotip configurado e rodando

---

## Instalação

```bash
npm install
cp .env.example .env
# Edite o .env se necessário (STAKE e PORT)
```

---

## Configuração (.env)

| Variável     | Padrão                  | Descrição                              |
|--------------|-------------------------|----------------------------------------|
| `PORT`       | `3002`                  | Porta do servidor bridge               |
| `STAKE`      | `10`                    | Valor de 1 unidade em reais (R$)       |
| `BRIDGE_URL` | `http://localhost:3002` | URL deste servidor (referência interna)|

---

## 1. Carregar a extensão no Chrome

1. Abra `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `extensao/`
5. Mantenha o Chrome aberto na **Bet365** sempre que quiser apostar automaticamente

> Após qualquer mudança na extensão, clique em **Atualizar** na página de extensões.

---

## 2. Subir o servidor bridge

```bash
npm start
```

O servidor sobe na porta `3002` e fica aguardando chamadas do robotip.

> Para rodar em background com PM2:
> ```bash
> pm2 start src/server.js --name betting-bridge
> pm2 save
> ```

---

## 3. Ativar bots no robotip

No **robotip**, acesse **Configurações → Auto-Aposta** e ligue o toggle dos bots que deseja validar.

A partir daí o fluxo é totalmente automático: alerta chega → aposta é feita.

---

## Testando manualmente

```bash
# Dry run — extensão navega mas NÃO confirma a aposta (recomendado para testar)
npm run test:dry

# Aposta real de R$0.50 (tenha cuidado!)
npm test
```

O teste envia um payload de exemplo (PSG × Lyon, Gols +/-, over 0.5) direto para o servidor bridge.

---

## Mercados suportados

| Mercado                           | Exemplo de bot                  |
|-----------------------------------|---------------------------------|
| `Gols +/-`                        | OVER GOL FT - V1.0              |
| `Escanteios Asiáticos`            | OVER 0.5 ESCANTEIOS FT - V7.0  |
| `1º Tempo - Gols +/-`             | UNDER 0.5 HT GOLS               |
| `1º Tempo - Escanteios Asiáticos` | OVER 2.5 ESCANTEIOS HT          |

---

## Endpoints do servidor

| Método | Rota                  | Descrição                                             |
|--------|-----------------------|-------------------------------------------------------|
| `POST` | `/apostar`            | Recebe payload estruturado e enfileira aposta         |
| `POST` | `/apostar-from-alert` | Recebe `raw_message` do robotip, parseia e enfileira  |
| `GET`  | `/pendente`           | Extensão busca aposta pendente (polling 2s)           |
| `POST` | `/resultado`          | Extensão reporta resultado (sucesso/erro)             |
| `GET`  | `/status`             | Verifica se o servidor está no ar                     |

### Payload de `/apostar`

```json
{
  "timeCasa":        "PSG",
  "timeVisitante":   "Lyon",
  "mercadoAsiatico": "Gols +/-",
  "offset":          0.5,
  "direcao":         "mais",
  "valorReais":      10.00,
  "dryRun":          false
}
```

### Payload de `/apostar-from-alert`

```json
{
  "raw_message": "Oportunidade! 🚨\n\n📊 OVER 0.5 ESCANTEIOS FT - V7.0\n..."
}
```

---

## Estrutura do projeto

```
betting-userbot/
├── src/
│   ├── server.js       # Servidor bridge HTTP (porta 3002)
│   └── parser.js       # Parser de mensagens do robotip
├── extensao/
│   ├── manifest.json   # Configuração da extensão (MV3)
│   ├── background.js   # Service worker — polling ao servidor
│   ├── content.js      # Executa o fluxo de aposta no DOM da Bet365
│   ├── popup.html      # Interface de status da extensão
│   └── popup.js        # Lógica do popup
├── test-extensao.js    # Teste manual de aposta
├── .env.example        # Variáveis de ambiente
└── package.json
```

---

## Solução de problemas

**Extensão não está recebendo apostas**
- Confirme que `npm start` está rodando na porta 3002
- Confirme que a extensão está ativa em `chrome://extensions`
- Verifique se há uma aba com a Bet365 aberta

**Erro "mercado não suportado"**
- O nome do bot no robotip precisa conter palavras-chave reconhecíveis (`gol`, `escanteio`, `over`, `under`)
- Veja o log do servidor para inspecionar o payload recebido

**Aposta não encontra o jogo**
- O jogo pode não estar disponível ao vivo na Bet365
- O mercado pode estar suspenso momentaneamente
- Abra o F12 no Chrome e filtre o console por `[BOT]` para ver o log detalhado da extensão
