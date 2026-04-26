#!/bin/bash
# Sobe o bridge local e expõe via Cloudflare Tunnel para o fly.io acessar

set -e

ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
  CLOUDFLARED="./cloudflared-linux-arm64"
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
else
  CLOUDFLARED="./cloudflared-linux-amd64"
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
fi

# Verifica se o cloudflared existe
if [ ! -f "$CLOUDFLARED" ]; then
  echo "[START] Baixando cloudflared ($ARCH)..."
  wget -q "$CF_URL" -O "$CLOUDFLARED"
  chmod +x "$CLOUDFLARED"
fi

PORT=${PORT:-3002}

# Mata processos antigos na porta (evita EADDRINUSE)
OLD_PID=$(lsof -ti :$PORT 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "[START] Matando processo antigo na porta $PORT (PID $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

TUNNEL_LOG=$(mktemp)

echo "[START] Iniciando bridge na porta $PORT..."
node src/server.js &
SERVER_PID=$!

sleep 1

echo "[START] Iniciando Cloudflare Tunnel..."
if [ -f ~/.cloudflared/config.yml ]; then
  "$CLOUDFLARED" tunnel run betting &
  TUNNEL_PID=$!
else
  "$CLOUDFLARED" tunnel --url http://localhost:$PORT 2>&1 | tee "$TUNNEL_LOG" &
  TUNNEL_PID=$!

  echo "[START] Aguardando URL do tunnel..."
  TUNNEL_URL=""
  for i in $(seq 1 20); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
    if [ -n "$TUNNEL_URL" ]; then break; fi
    sleep 1
  done

  echo ""
  if [ -n "$TUNNEL_URL" ]; then
    echo "[START] ✅ Tunnel URL: $TUNNEL_URL"
    echo ""
    echo "[START] 👉 Rode agora:"
    echo "         fly secrets set BETTING_BRIDGE_URL=$TUNNEL_URL -a backend-spring-snow-186"
  else
    echo "[START] ⚠️  URL não detectada ainda — verifique o log acima"
  fi
fi

echo ""
echo "[START] ✅ Bridge rodando (PID $SERVER_PID)"
echo "[START] ✅ Tunnel rodando (PID $TUNNEL_PID)"
echo ""

trap "kill $SERVER_PID $TUNNEL_PID 2>/dev/null; rm -f $TUNNEL_LOG; exit" INT TERM
wait $SERVER_PID
