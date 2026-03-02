#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# IoT Platform - Configuração SSL com Let's Encrypt
# Uso: sudo bash ssl.sh meudominio.com email@meudominio.com
# ─────────────────────────────────────────────────────────────────

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

DOMAIN=${1:-""}
EMAIL=${2:-"admin@$DOMAIN"}

if [ -z "$DOMAIN" ]; then
  echo -e "${RED}Uso: sudo bash ssl.sh meudominio.com email@meudominio.com${NC}"
  exit 1
fi

echo -e "${CYAN}Configurando SSL para: $DOMAIN${NC}"

# 1. Obter certificado via certbot
echo -e "${YELLOW}Obtendo certificado SSL...${NC}"
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# 2. Atualizar nginx conf para HTTPS
echo -e "${YELLOW}Atualizando configuração Nginx...${NC}"
cat > nginx/conf.d/app.conf << EOF
# HTTP → redireciona para HTTPS
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# 3. Recarregar Nginx
docker compose exec nginx nginx -s reload

echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo -e "${GREEN}✓ SSL configurado com sucesso!${NC}"
echo -e "${CYAN}Acesse: https://$DOMAIN${NC}"
echo ""
echo -e "${YELLOW}Renovação automática já configurada via certbot no docker-compose.${NC}"
echo "────────────────────────────────────────────────────────────"
