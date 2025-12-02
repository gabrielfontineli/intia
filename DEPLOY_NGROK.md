# Deploy com ngrok para Demo

Este guia mostra como expor seu projeto na internet usando ngrok para testes e demonstrações.

## Pré-requisitos

1. Docker e Docker Compose instalados
2. Conta no ngrok (gratuita) - https://ngrok.com/
3. ngrok instalado localmente

### Instalar ngrok

**macOS:**
```bash
brew install ngrok
```

**Linux:**
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.stable.linux.amd64.tgz | sudo tar xzf - -C /usr/local/bin
```

**Windows:**
Baixe de https://ngrok.com/download

### Configurar ngrok

```bash
ngrok config add-authtoken SEU_TOKEN_AQUI
```

## Opção 1: Expor apenas o Frontend (Recomendado)

Esta é a opção mais simples - expõe apenas o frontend, e o backend roda internamente.

### Passo 1: Subir o projeto

```bash
docker compose up --build
```

### Passo 2: Em outro terminal, expor o frontend

```bash
ngrok http 3000
```

### Passo 3: Atualizar a URL do backend

O ngrok vai mostrar uma URL tipo `https://abc123.ngrok-free.app`. Você precisa criar outro túnel para o backend:

```bash
ngrok http 8000
```

### Passo 4: Configurar a variável de ambiente

Pegue a URL do backend (ex: `https://xyz789.ngrok-free.app`) e reinicie o frontend com:

```bash
# Parar o docker compose (Ctrl+C)
PUBLIC_API_URL=https://xyz789.ngrok-free.app/api docker compose up --build frontend
```

**Pronto!** Compartilhe a URL do frontend (ex: `https://abc123.ngrok-free.app`) com outras pessoas.

## Opção 2: Expor ambos os serviços (Plano Pago ngrok)

Com o plano pago do ngrok, você pode ter múltiplos túneis simultâneos.

### Criar arquivo ngrok.yml

```yaml
version: "2"
authtoken: SEU_TOKEN_AQUI
tunnels:
  backend:
    proto: http
    addr: 8000
  frontend:
    proto: http
    addr: 3000
```

### Iniciar todos os túneis

```bash
# Terminal 1: Subir o projeto
docker compose up --build

# Terminal 2: Iniciar túneis ngrok
ngrok start --all --config ngrok.yml
```

## Opção 3: Usar um domínio fixo (Recomendado para demos recorrentes)

Com o plano pago, você pode ter domínios fixos.

### docker-compose.override.yml

Crie este arquivo para sobrescrever configurações localmente:

```yaml
version: '3.8'

services:
  frontend:
    environment:
      - PUBLIC_API_URL=https://seu-backend-fixo.ngrok-free.app/api
```

Depois só precisar rodar:

```bash
ngrok http --domain=seu-backend-fixo.ngrok-free.app 8000  # Terminal 1
ngrok http --domain=seu-frontend-fixo.ngrok-free.app 3000  # Terminal 2
docker compose up --build  # Terminal 3
```

## Solução Rápida: Script Automático (Plano Gratuito)

Para facilitar, criei um script que automatiza tudo:

```bash
chmod +x deploy-ngrok.sh
./deploy-ngrok.sh
```

O script irá:
1. Subir o backend
2. Criar túnel ngrok para o backend
3. Capturar a URL do backend
4. Subir o frontend com a URL correta
5. Criar túnel ngrok para o frontend
6. Mostrar as URLs para compartilhar

## Dicas Importantes

### 1. Aviso de segurança do ngrok

Usuários verão um aviso do ngrok na primeira visita. Isso é normal no plano gratuito.

### 2. WebSocket

Se seu app usa WebSocket, o ngrok suporta automaticamente. Apenas certifique-se de que a URL do WebSocket também use a URL pública.

### 3. Upload de arquivos

Se você tem upload de imagens (como no seu projeto), certifique-se de que os caminhos estejam corretos.

### 4. Tempo de vida

No plano gratuito, os túneis ngrok ficam ativos enquanto o processo estiver rodando. Se você fechar o terminal, o túnel cai.

### 5. Limites do plano gratuito

- 1 túnel simultâneo por vez
- URLs mudam a cada reinício (sem domínio fixo)
- Limite de 40 conexões/minuto

## Alternativas ao ngrok

Se precisar de algo mais permanente ou sem limitações:

- **Cloudflare Tunnel** (gratuito, mais estável)
- **localtunnel** (gratuito, open-source)
- **serveo.net** (gratuito, sem instalação)
- **VPS** (DigitalOcean, AWS, etc - mais profissional)

## Troubleshooting

### Frontend não conecta ao backend

Verifique se a variável `PUBLIC_API_URL` está correta:

```bash
docker compose logs frontend | grep PUBLIC_API_URL
```

### CORS errors

O backend já está configurado com CORS aberto (`allow_origins=["*"]`), mas se tiver problemas, verifique o console do navegador.

### ngrok muito lento

O plano gratuito pode ser lento. Considere:
- Usar região mais próxima: `ngrok http 3000 --region us`
- Fazer upgrade para o plano pago
- Usar alternativas como Cloudflare Tunnel

---

**Dúvidas?** Abra uma issue no repositório!
