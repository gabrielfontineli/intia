# 🚀 Quick Start - Demo com ngrok

## ⚠️ Plano Gratuito do ngrok

O plano gratuito permite **apenas 1 túnel simultâneo**. Escolha uma das opções abaixo.

## Opção 1: Script Automático (Recomendado) 

```bash
# 1. Instalar ngrok (se ainda não tiver)
brew install ngrok  # macOS
# ou baixe em: https://ngrok.com/download

# 2. Configurar token (só uma vez)
ngrok config add-authtoken SEU_TOKEN_AQUI

# 3. Rodar o script e escolher a opção desejada
./deploy-ngrok.sh
```

O script oferece 3 opções:
1. **Expor só Frontend** - Rápido para demos visuais
2. **Expor só Backend** - Para testar API
3. **Nginx Proxy** - Solução completa (frontend + backend em 1 túnel) ✨

**Recomendo a opção 3** para uma demo completa!

## Opção 2: Nginx Proxy Manual (Solução Completa)

Esta é a melhor solução para o plano gratuito - expõe tudo em um único túnel!

```bash
# 1. Criar arquivo nginx.conf
cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        
        location / {
            proxy_pass http://frontend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
        
        location /api {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
        }
        
        location /ws {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
        }
    }
}
EOF

# 2. Subir o projeto
docker compose up -d --build

# 3. Subir nginx
docker run -d --name nginx-proxy \
    --network intia_app-network \
    -p 8080:80 \
    -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
    nginx:alpine

# 4. Expor nginx no ngrok
ngrok http 8080
```

Compartilhe a URL do ngrok! Tudo funcionará: frontend, backend e websocket. 🎉

## Opção 3: Expor Apenas Frontend

```bash
docker compose up -d --build
ngrok http 3000
```

**Limitação:** Backend só funciona localmente.

## Parando tudo

```bash
./stop-ngrok.sh
```

ou `Ctrl+C` + `docker compose down`

---

📖 **Guia completo:** Veja `DEPLOY_NGROK.md` para mais detalhes.
