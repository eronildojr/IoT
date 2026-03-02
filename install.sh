#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# IoT Platform - Script de Instalação Automática
# Compatível com: Ubuntu 20.04 / 22.04 / 24.04
# ─────────────────────────────────────────────────────────────────

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}"
echo "  ██╗ ██████╗ ████████╗    ██████╗ ██╗      █████╗ ████████╗███████╗"
echo "  ██║██╔═══██╗╚══██╔══╝    ██╔══██╗██║     ██╔══██╗╚══██╔══╝██╔════╝"
echo "  ██║██║   ██║   ██║       ██████╔╝██║     ███████║   ██║   █████╗  "
echo "  ██║██║   ██║   ██║       ██╔═══╝ ██║     ██╔══██║   ██║   ██╔══╝  "
echo "  ██║╚██████╔╝   ██║       ██║     ███████╗██║  ██║   ██║   ██║     "
echo "  ╚═╝ ╚═════╝    ╚═╝       ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     "
echo -e "${NC}"
echo -e "${GREEN}Plataforma IoT Universal - Instalação${NC}"
echo "────────────────────────────────────────────────────────────"

# Verificar root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Execute como root: sudo bash install.sh${NC}"
  exit 1
fi

# Verificar/instalar Docker
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Instalando Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}✓ Docker instalado${NC}"
else
  echo -e "${GREEN}✓ Docker já instalado${NC}"
fi

# Verificar/instalar Docker Compose
if ! command -v docker compose &> /dev/null; then
  echo -e "${YELLOW}Instalando Docker Compose...${NC}"
  apt-get install -y docker-compose-plugin
  echo -e "${GREEN}✓ Docker Compose instalado${NC}"
else
  echo -e "${GREEN}✓ Docker Compose já instalado${NC}"
fi

# Criar .env se não existir
if [ ! -f .env ]; then
  cp .env.example .env
  # Gerar JWT_SECRET aleatório
  JWT=$(openssl rand -hex 32)
  sed -i "s/change_this_to_a_very_long_random_string_min_32_chars/$JWT/" .env
  echo -e "${YELLOW}⚠  Arquivo .env criado. Configure suas credenciais em .env antes de continuar.${NC}"
  echo ""
  echo -e "${CYAN}Edite o arquivo .env:${NC}"
  echo "  nano .env"
  echo ""
  read -p "Pressione ENTER após configurar o .env para continuar..."
fi

# Subir serviços
echo -e "${YELLOW}Iniciando serviços...${NC}"
docker compose up -d --build

# Aguardar backend
echo -e "${YELLOW}Aguardando banco de dados...${NC}"
sleep 15

# Verificar saúde
echo ""
echo -e "${GREEN}────────────────────────────────────────────────────────────${NC}"
echo -e "${GREEN}✓ IoT Platform instalada com sucesso!${NC}"
echo ""
echo -e "${CYAN}Acesso:${NC}"
echo "  🌐 Plataforma:  http://$(curl -s ifconfig.me 2>/dev/null || echo 'SEU-IP')"
echo "  📍 Traccar GPS: http://$(curl -s ifconfig.me 2>/dev/null || echo 'SEU-IP'):8082"
echo ""
echo -e "${CYAN}Credenciais Super Admin:${NC}"
source .env
echo "  E-mail: $SUPERADMIN_EMAIL"
echo "  Senha:  $SUPERADMIN_PASSWORD"
echo ""
echo -e "${YELLOW}Para SSL (HTTPS), execute:${NC}"
echo "  bash ssl.sh meudominio.com"
echo "────────────────────────────────────────────────────────────"
