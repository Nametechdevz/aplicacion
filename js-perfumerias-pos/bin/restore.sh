#!/usr/bin/env bash
# Restauración de una copia de seguridad (REEMPLAZA los datos actuales).
#   bin/restore.sh storage/backups/db-AAAAMMDD-HHMMSS.sql.gz [storage/backups/uploads-AAAAMMDD-HHMMSS.tar.gz]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_FILE="${1:?Indique el archivo db-*.sql.gz}"
UP_FILE="${2:-}"
get() { grep -E "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/[[:space:]]+#.*$//'; }
DB_HOST="$(get DB_HOST)"; DB_PORT="$(get DB_PORT)"; DB_NAME="$(get DB_DATABASE)"; DB_USER="$(get DB_USERNAME)"; DB_PASS="$(get DB_PASSWORD)"
read -r -p "Se reemplazará la base de datos '$DB_NAME'. Escriba RESTAURAR para continuar: " OK
[ "$OK" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "${DB_HOST:-127.0.0.1}" "${DB_PORT:-3306}" "$DB_USER" "$DB_PASS" > "$CNF"; chmod 600 "$CNF"
gunzip -c "$DB_FILE" | mysql --defaults-extra-file="$CNF" --default-character-set=utf8mb4 "$DB_NAME"
if [ -n "$UP_FILE" ]; then tar -xzf "$UP_FILE" -C "$ROOT/public/uploads"; fi
echo "Restauración completada. Verifique el inicio de sesión y ejecute: php bin/migrate.php"
