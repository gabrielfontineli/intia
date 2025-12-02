#!/bin/bash

# Script para deploy rápido com ngrok (Plano Gratuito)
# Uso: ./deploy-ngrok.sh

set -e

echo "🚀 Iniciando deploy com ngrok (Plano Gratuito)..."
echo ""

# Verifica se ngrok está instalado
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok não encontrado. Instale com:"
    echo "   macOS: brew install ngrok"
    echo "   Linux: curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.stable.linux.amd64.tgz | sudo tar xzf - -C /usr/local/bin"
    exit 1
fi

# Verifica se docker está rodando
if ! docker info &> /dev/null; then
    echo "❌ Docker não está rodando. Inicie o Docker primeiro."
    exit 1
fi

echo "📦 Parando containers antigos..."
docker compose down 2>/dev/null || true

echo ""
echo "ℹ️  No plano gratuito, você só pode ter 1 túnel ngrok."
echo "   Escolha uma opção:"
echo ""
echo "   1) Expor apenas FRONTEND (Recomendado para demo)"
echo "      → Usuários acessam o frontend, mas backend fica local"
echo "      → Funciona se você estiver na mesma rede ou usar proxy reverso"
echo ""
echo "   2) Expor apenas BACKEND"
echo "      → Usuários acessam localhost:3000 localmente"
echo "      → Útil para testar API externamente"
echo ""
echo "   3) Usar nginx como proxy (Expor tudo em 1 túnel)"
echo "      → Mais complexo, mas funciona no plano gratuito"
echo ""
read -p "Escolha (1/2/3): " choice

case $choice in
    1)
        echo ""
        echo "🔨 Construindo projeto completo..."
        docker compose up -d --build
        
        echo ""
        echo "⏳ Aguardando serviços iniciarem (15 segundos)..."
        sleep 15
        
        echo ""
        echo "🌐 Criando túnel ngrok para o FRONTEND..."
        ngrok http 3000 --log=stdout > /tmp/ngrok.log &
        NGROK_PID=$!
        
        echo "⏳ Aguardando túnel ngrok (5 segundos)..."
        sleep 5
        
        FRONTEND_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[a-zA-Z0-9.-]*\.ngrok-free\.app' | head -1)
        
        if [ -z "$FRONTEND_URL" ]; then
            echo "❌ Erro ao capturar URL do ngrok."
            kill $NGROK_PID 2>/dev/null || true
            exit 1
        fi
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🎉 Deploy concluído!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📱 Compartilhe esta URL: $FRONTEND_URL"
        echo "📊 Dashboard ngrok: http://localhost:4040"
        echo ""
        echo "⚠️  LIMITAÇÃO: Backend está rodando apenas localmente."
        echo "   O app pode não funcionar 100% para usuários externos."
        echo "   Para solução completa, use a opção 3 ou upgrade ngrok."
        echo ""
        ;;
        
    2)
        echo ""
        echo "🔨 Construindo projeto completo..."
        docker compose up -d --build
        
        echo ""
        echo "⏳ Aguardando serviços iniciarem (15 segundos)..."
        sleep 15
        
        echo ""
        echo "🌐 Criando túnel ngrok para o BACKEND..."
        ngrok http 8000 --log=stdout > /tmp/ngrok.log &
        NGROK_PID=$!
        
        echo "⏳ Aguardando túnel ngrok (5 segundos)..."
        sleep 5
        
        BACKEND_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[a-zA-Z0-9.-]*\.ngrok-free\.app' | head -1)
        
        if [ -z "$BACKEND_URL" ]; then
            echo "❌ Erro ao capturar URL do ngrok."
            kill $NGROK_PID 2>/dev/null || true
            exit 1
        fi
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🎉 Deploy concluído!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📱 API disponível em: $BACKEND_URL"
        echo "🖥️  Frontend local: http://localhost:3000"
        echo "📊 Dashboard ngrok: http://localhost:4040"
        echo ""
        echo "ℹ️  Para usar a API externa no frontend, reconfigure:"
        echo "   PUBLIC_API_URL=$BACKEND_URL/api docker compose restart frontend"
        echo ""
        ;;
        
    3)
        echo ""
        echo "🔨 Construindo projeto..."
        docker compose up -d --build
        
        echo ""
        echo "⏳ Aguardando serviços iniciarem (15 segundos)..."
        sleep 15
        
        echo ""
        echo "🔨 Criando configuração nginx..."
        
        # Criar nginx.conf temporário
        cat > /tmp/nginx-ngrok.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        
        # Frontend
        location / {
            proxy_pass http://frontend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
        
        # Backend API
        location /api {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
        
        # WebSocket
        location /ws {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
        }
    }
}
EOF
        
        echo ""
        echo "🔨 Adicionando nginx ao docker-compose..."
        
        # Remove nginx antigo se existir
        docker stop nginx-proxy 2>/dev/null || true
        docker rm nginx-proxy 2>/dev/null || true
        
        # Criar container nginx
        docker run -d --name nginx-proxy \
            --network intia_app-network \
            -p 8080:80 \
            nginx:alpine
        
        # Copiar configuração para dentro do container
        docker cp /tmp/nginx-ngrok.conf nginx-proxy:/etc/nginx/nginx.conf
        
        # Recarregar nginx
        docker exec nginx-proxy nginx -s reload
        
        echo ""
        echo "🌐 Criando túnel ngrok para o NGINX (porta 8080)..."
        ngrok http 8080 --log=stdout > /tmp/ngrok.log &
        NGROK_PID=$!
        
        echo "⏳ Aguardando túnel ngrok (5 segundos)..."
        sleep 5
        
        PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[a-zA-Z0-9.-]*\.ngrok-free\.app' | head -1)
        
        if [ -z "$PUBLIC_URL" ]; then
            echo "❌ Erro ao capturar URL do ngrok."
            kill $NGROK_PID 2>/dev/null || true
            docker stop nginx-proxy 2>/dev/null || true
            docker rm nginx-proxy 2>/dev/null || true
            exit 1
        fi
        
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🎉 Deploy concluído com NGINX!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📱 Compartilhe esta URL: $PUBLIC_URL"
        echo "   → Frontend: $PUBLIC_URL/"
        echo "   → Backend: $PUBLIC_URL/api"
        echo ""
        echo "📊 Dashboard ngrok: http://localhost:4040"
        echo ""
        echo "✅ Tudo funcionando em um único túnel!"
        echo ""
        ;;
        
    *)
        echo "❌ Opção inválida!"
        exit 1
        ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   • Não feche este terminal ou o túnel cairá"
echo "   • Para parar: Ctrl+C e depois rode ./stop-ngrok.sh"
echo "   • Log do ngrok: /tmp/ngrok.log"
echo ""

# Salva o PID para poder parar depois
echo $NGROK_PID > /tmp/ngrok.pid

# Espera até receber Ctrl+C
trap cleanup EXIT

cleanup() {
    echo ""
    echo "🛑 Parando serviços..."
    kill $NGROK_PID 2>/dev/null || true
    docker compose down
    docker stop nginx-proxy 2>/dev/null || true
    docker rm nginx-proxy 2>/dev/null || true
    rm -f /tmp/ngrok.pid /tmp/ngrok.log /tmp/nginx-ngrok.conf
    echo "✅ Tudo parado!"
}

echo "🔄 Aguardando... (Ctrl+C para parar)"
wait
