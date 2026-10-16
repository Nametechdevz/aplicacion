#!/usr/bin/env bash
# Copia de seguridad de JS Perfumerías POS: base de datos + imágenes de productos.
#   bin/backup.sh [directorio_destino]     (por defecto storage/backups)
# Programar en cron, por ejemplo cada noche a las 2:15:
#   15 2 * * * /var/www/js-pos/bin/backup.sh >> /var/www/js-pos/storage/logs/backup.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/storage/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
# Lee las credenciales del .env sin exponerlas en la línea de comandos.
get() { grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/[[:space:]]+#.*$//'; }
DB_HOST="$(get DB_HOST)"; DB_PORT="$(get DB_PORT)"; DB_NAME="$(get DB_DATABASE)"; DB_USER="$(get DB_USERNAME)"; DB_PASS="$(get DB_PASSWORD)"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"; chmod 700 "$DEST"
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "${DB_HOST:-127.0.0.1}" "${DB_PORT:-3306}" "$DB_USER" "$DB_PASS" > "$CNF"
chmod 600 "$CNF"
mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --triggers --no-tablespaces --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$DEST/db-$STAMP.sql.gz"
tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$ROOT/public/uploads" products
sha256sum "$DEST/db-$STAMP.sql.gz" "$DEST/uploads-$STAMP.tar.gz" > "$DEST/backup-$STAMP.sha256"
find "$DEST" -type f -mtime +"$KEEP_DAYS" \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' -o -name 'backup-*.sha256' \) -delete
echo "[$(date)] Copia creada: $DEST/db-$STAMP.sql.gz y uploads-$STAMP.tar.gz"
