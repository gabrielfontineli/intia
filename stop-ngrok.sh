#!/bin/bash

# Script para parar todos os serviços ngrok
echo "🛑 Parando serviços ngrok..."

# Para processos ngrok
if [ -f /tmp/ngrok.pid ]; then
    kill $(cat /tmp/ngrok.pid) 2>/dev/null || true
    rm -f /tmp/ngrok.pid
fi

# Mata todos os processos ngrok remanescentes
pkill -f ngrok 2>/dev/null || true

# Para containers Docker
docker compose down

# Para e remove nginx proxy se existir
docker stop nginx-proxy 2>/dev/null || true
docker rm nginx-proxy 2>/dev/null || true

# Limpa logs e configs temporários
rm -f /tmp/ngrok*.log /tmp/nginx-ngrok.conf

echo "✅ Tudo parado!"
