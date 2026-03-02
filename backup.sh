#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# IoT Platform - Backup do Banco de Dados
# Uso: bash backup.sh
# Agendar: crontab -e → 0 2 * * * /caminho/backup.sh
# ─────────────────────────────────────────────────────────────────

set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="iotplatform_backup_$DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

# Carregar variáveis
source .env 2>/dev/null || true
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-iot_secure_pass_2024}

echo -e "${YELLOW}Iniciando backup: $FILENAME${NC}"

docker compose exec -T postgres pg_dump \
  -U iotuser \
  -d iotplatform \
  | gzip > "$BACKUP_DIR/$FILENAME"

SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
echo -e "${GREEN}✓ Backup concluído: $BACKUP_DIR/$FILENAME ($SIZE)${NC}"

# Manter apenas os últimos 30 backups
ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm
echo -e "${GREEN}✓ Backups antigos removidos (mantendo últimos 30)${NC}"
