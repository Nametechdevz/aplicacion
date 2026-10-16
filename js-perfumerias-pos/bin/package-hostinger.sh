#!/usr/bin/env bash
# Genera dist/js-perfumerias-pos-hostinger.zip con la estructura de Hostinger:
#   public_html/  (contenido de public/ con index.php adaptado)
#   js-pos/       (código privado, fuera del document root)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/js-pos" "$STAGE/public_html" "$OUT"

# Código privado
for d in app bin config database deploy docs routes; do cp -a "$ROOT/$d" "$STAGE/js-pos/"; done
cp -a "$ROOT/composer.json" "$ROOT/README.md" "$ROOT/.env.example" "$STAGE/js-pos/"
mkdir -p "$STAGE/js-pos/storage/logs" "$STAGE/js-pos/storage/cache" "$STAGE/js-pos/storage/backups"
touch "$STAGE/js-pos/storage/logs/.gitkeep" "$STAGE/js-pos/storage/cache/.gitkeep" "$STAGE/js-pos/storage/backups/.gitkeep"
printf 'Require all denied\n' > "$STAGE/js-pos/.htaccess"
cp "$ROOT/deploy/hostinger/LEEME-HOSTINGER.md" "$STAGE/LEEME-HOSTINGER.md"
cp "$ROOT/deploy/hostinger/LEEME-HOSTINGER.md" "$STAGE/js-pos/LEEME-HOSTINGER.md"

# Carpeta pública
cp -a "$ROOT/public/." "$STAGE/public_html/"
cp "$ROOT/deploy/hostinger/index.php" "$STAGE/public_html/index.php"
find "$STAGE/public_html/uploads/products" -type f ! -name '.gitkeep' -delete

# Permisos estándar de hosting compartido
find "$STAGE" -type d -exec chmod 755 {} \;
find "$STAGE" -type f -exec chmod 644 {} \;
chmod 755 "$STAGE/js-pos/bin/"*.sh

# Nunca empaquetar secretos ni datos locales
rm -f "$STAGE/js-pos/.env"

(cd "$STAGE" && rm -f "$OUT/js-perfumerias-pos-hostinger.zip" && zip -qr -X "$OUT/js-perfumerias-pos-hostinger.zip" LEEME-HOSTINGER.md public_html js-pos)
echo "Paquete creado: $OUT/js-perfumerias-pos-hostinger.zip"
