# JS Perfumerías POS

Sistema POS multisucursal para perfumerías: catálogo fotográfico, inventario central con
distribución y transferencias, venta por unidad, mililitros y gramos, descuentos auditados con
autorización, caja con cierres, compras, devoluciones, reportes y auditoría.

- **Backend:** PHP 8.3+ (MVC propio, sin dependencias obligatorias), PDO con consultas preparadas reales.
- **Base de datos:** MySQL 8 (compatible con MariaDB 10.6+ para desarrollo).
- **Frontend:** HTML5, CSS y JavaScript sin frameworks; gráficas SVG propias; modo claro/oscuro.
- **Idioma, moneda y hora:** español (Colombia), COP, `America/Bogota`. Las fechas se guardan en UTC.

> Documentación complementaria:
> [Arquitectura](docs/ARQUITECTURA.md) · [Manual de usuario](docs/MANUAL_USUARIO.md) ·
> [Pruebas](docs/PRUEBAS.md) · [Copias de seguridad](#8-copias-de-seguridad-y-restauración)

---

## Índice
1. [Requisitos](#1-requisitos)
2. [Instalación local](#2-instalación-local)
3. [Primer superadministrador](#3-primer-superadministrador)
4. [Datos de demostración (opcional)](#4-datos-de-demostración-opcional)
5. [Despliegue en VPS (Nginx o Apache)](#5-despliegue-en-vps)
6. [Despliegue en hosting compartido](#6-despliegue-en-hosting-compartido)
7. [HTTPS y permisos de directorios](#7-https-y-permisos-de-directorios)
8. [Copias de seguridad y restauración](#8-copias-de-seguridad-y-restauración)
9. [Actualizaciones](#9-actualizaciones)
10. [Seguridad](#10-seguridad)
11. [Estructura del proyecto](#11-estructura-del-proyecto)
12. [Pendientes e integraciones externas](#12-pendientes-e-integraciones-externas)

---

## 1. Requisitos

| Componente | Versión |
|---|---|
| PHP | 8.3 o superior con `pdo_mysql`, `gd` (con WebP), `mbstring`, `fileinfo`, `json`, `intl` recomendado |
| MySQL | 8.0+ (`utf8mb4`, InnoDB) |
| Servidor web | Nginx + PHP-FPM o Apache 2.4 con `mod_rewrite` |
| Opcional | Composer (solo para autoload optimizado), `mysqldump` para copias |

## 2. Instalación local

```bash
cp .env.example .env            # complete DB_* y APP_URL; APP_ENV=local, SESSION_SECURE=false en http
php bin/migrate.php             # crea la base de datos y aplica database/migrations/*.sql
php bin/create-superadmin.php   # crea el primer superadministrador (pide la contraseña sin eco)
php -S 127.0.0.1:8080 -t public public/index.php
```

Abra `http://127.0.0.1:8080`. Si prefiere importar el esquema con phpMyAdmin, use
`database/schema.sql` (generado con `php bin/build-schema.php`).

Las migraciones crean además los datos **estructurales** necesarios (no comerciales): roles,
permisos, unidades de medida y conversiones (L↔ml, kg↔g), medios de pago, configuración por
defecto y el **Almacén central**.

## 3. Primer superadministrador

El primer superadministrador solo puede crearse por consola; no existe ninguna ruta web que
permita crearlo sin sesión:

```bash
php bin/create-superadmin.php
# o de forma no interactiva (la clave por variable de entorno, nunca como argumento):
JSP_ADMIN_PASSWORD='***' php bin/create-superadmin.php --name="Nombre Apellido" --username=admin --email=admin@empresa.co
```

El script se niega a continuar si ya existe un superadministrador. Los demás usuarios se crean
desde **Usuarios y roles**.

## 4. Datos de demostración (opcional)

```bash
php bin/migrate.php --fresh
php bin/create-superadmin.php
JSP_DEMO_PASSWORD='ClaveDemo2026' php bin/seed-demo.php
```

Crea 3 sucursales, usuarios de ejemplo (`admin.centro`, `admin.norte`, `cajero.centro`,
`cajero.norte`, `cajero.occidente`), un catálogo con marcas, clientes y proveedor rotulados
**"Demo"** y 30 días de operaciones. Todo se genera con los servicios reales (compra, recepción,
distribución, ventas, descuentos autorizados, anulación, devolución, cierres), por lo que las
cifras son consistentes, pero **son ficticias**: el comando está bloqueado en
`APP_ENV=production`. No incluye fotografías: el catálogo muestra la imagen de reemplazo hasta que
se carguen fotos propias.

## 5. Despliegue en VPS

1. Copie el proyecto a `/var/www/js-pos` (por ejemplo con `git clone`).
2. Configure `.env` con `APP_ENV=production`, `APP_DEBUG=false`, `SESSION_SECURE=true` y un usuario
   de MySQL con privilegios limitados (`deploy/mysql-user.sql`).
3. `php bin/migrate.php` y `php bin/create-superadmin.php`.
4. Servidor web: el **document root debe ser `public/`**.
   - Nginx: `deploy/nginx.conf`.
   - Apache: `deploy/apache-vhost.conf` (usa `public/.htaccess`).
5. Opcional: `composer install --no-dev --optimize-autoloader` (la app funciona también sin Composer).
6. Programe la copia de seguridad diaria (sección 8).

## 6. Despliegue en hosting compartido

- Suba el proyecto **fuera** de `public_html` (por ejemplo `~/js-pos`) y apunte el dominio o
  subdominio a `~/js-pos/public`. Si el panel no permite cambiar el document root, copie el
  contenido de `public/` dentro de `public_html` y ajuste en `public_html/index.php` la ruta
  `require dirname(__DIR__) . '/app/bootstrap.php'` hacia la carpeta del proyecto.
- Como última alternativa, el `.htaccess` de la raíz del proyecto redirige a `public/` y bloquea
  `app/`, `config/`, `database/`, `storage/`, `.env`, etc.
- Cree la base de datos desde el panel, importe `database/schema.sql` en phpMyAdmin si no tiene
  acceso SSH, y ejecute `bin/create-superadmin.php` desde la terminal del panel (o pida soporte).
- Seleccione PHP 8.3 en el panel y verifique que `gd` tenga soporte WebP.

## 7. HTTPS y permisos de directorios

- **HTTPS obligatorio en producción** (Let's Encrypt: `certbot --nginx -d pos.su-dominio.com`).
  Con `SESSION_SECURE=true` la cookie de sesión solo viaja cifrada.
- Permisos sugeridos (usuario del servidor `www-data`):

```bash
chown -R deploy:www-data /var/www/js-pos
find /var/www/js-pos -type d -exec chmod 750 {} \;
find /var/www/js-pos -type f -exec chmod 640 {} \;
chmod -R 770 /var/www/js-pos/storage /var/www/js-pos/public/uploads
chmod 600 /var/www/js-pos/.env && chown deploy:www-data /var/www/js-pos/.env && chmod 640 /var/www/js-pos/.env
chmod 750 /var/www/js-pos/bin/*.sh
```

## 8. Copias de seguridad y restauración

```bash
bin/backup.sh                         # storage/backups/db-AAAAMMDD-HHMMSS.sql.gz + uploads-*.tar.gz + .sha256
KEEP_DAYS=60 bin/backup.sh /ruta/externa
```

- Usa `mysqldump --single-transaction` (copia consistente sin bloquear ventas) y no expone la clave
  en la línea de comandos.
- Programe en cron: `15 2 * * * /var/www/js-pos/bin/backup.sh >> /var/www/js-pos/storage/logs/backup.log 2>&1`.
- Copie las copias **fuera del servidor** (almacenamiento externo cifrado) y pruebe la
  restauración periódicamente.

Restauración (reemplaza los datos actuales; pide confirmación escrita):

```bash
bin/restore.sh storage/backups/db-20261016-021500.sql.gz storage/backups/uploads-20261016-021500.tar.gz
php bin/migrate.php
```

## 9. Actualizaciones

1. `bin/backup.sh`
2. `git pull` (o subir los archivos nuevos, sin sobrescribir `.env`, `storage/` ni `public/uploads/`).
3. `php bin/migrate.php` (aplica solo las migraciones pendientes; nunca borra datos).
4. `php tests/run.php` en un entorno de pruebas antes de producción.
5. Recargar PHP-FPM si usa OPcache con `validate_timestamps=0`.

## 10. Seguridad

- **RBAC con permisos explícitos** (41 permisos, 3 roles base y permisos individuales que conceden
  o niegan). Cada ruta declara su permiso y cada servicio vuelve a validar la **sucursal** del
  registro: cambiar un ID en la URL devuelve 403.
- PDO con consultas preparadas reales (`ATTR_EMULATE_PREPARES=false`), escape HTML en todas las
  vistas, CSP restrictiva (sin scripts en línea), `X-Frame-Options`, `nosniff`, `Referrer-Policy`.
- CSRF en toda petición que modifica datos; sesiones `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS,
  modo estricto, regeneración del ID al iniciar sesión y expiración por inactividad.
- Contraseñas con `password_hash`/`password_verify` y rehash automático; bloqueo por intentos
  fallidos por usuario e IP (configurable en `.env`).
- El servidor **recalcula precios, descuentos, totales, existencias y pagos**; nunca confía en el
  navegador. La sucursal de venta sale de la sesión, no de la petición.
- Ventas, transferencias, recepciones, cierres y devoluciones en **transacciones** con bloqueo
  de filas (`SELECT … FOR UPDATE`, orden fijo para evitar interbloqueos) e **idempotencia**
  (`client_request_id` único).
- Imágenes: validación de tamaño, extensión y MIME real, decodificación y **re-codificación a WebP**
  con GD, nombres aleatorios y carpeta sin ejecución de scripts.
- Errores sin trazas para el público (`APP_DEBUG=false`), registro en `storage/logs/`.
- Auditoría de sesiones, productos, precios, descuentos, autorizaciones, inventario, transferencias,
  ventas, anulaciones, devoluciones, caja, permisos y configuración. No existe ruta para editarla.

## 11. Estructura del proyecto

```
public/            index.php (único punto de entrada), assets/, uploads/products/
app/Core/          Router, Request/Response, Database (PDO), Session, Csrf, Auth (RBAC), View
app/Controllers/   Controladores delgados por módulo
app/Services/      Lógica de negocio (ventas, inventario, transferencias, caja, compras…)
app/Repositories/  Consultas de lectura del catálogo
app/Validators/    Validación del lado del servidor
app/Support/       Dec (aritmética decimal exacta), Migrator, Log
app/Views/         Plantillas PHP por módulo y layouts
config/  routes/   Configuración y rutas
database/          migrations/*.sql, seeders/, schema.sql
storage/           logs/, cache/, backups/   (no accesibles desde la web)
tests/             run.php (unitarias + integración), TestCase.php
bin/               migrate, create-superadmin, seed-demo, build-schema, backup.sh, restore.sh
deploy/            nginx.conf, apache-vhost.conf, mysql-user.sql
```

## 12. Pendientes e integraciones externas

- **Pagos electrónicos:** Nequi, transferencias y tarjetas se registran con referencia y quedan
  *pendientes de verificación manual*. Para confirmarlos automáticamente se requiere la
  integración con la pasarela o banco (credenciales y webhooks del proveedor).
- **Facturación electrónica DIAN:** el comprobante del POS indica que no es factura electrónica.
  La emisión requiere un proveedor tecnológico autorizado y sus credenciales.
- **Fidelización:** las tablas `loyalty_programs` y `loyalty_ledger` están preparadas e inactivas;
  falta que la empresa defina las reglas de puntos.
- **Correo:** no se envían correos (restablecimiento de contraseña lo hace un administrador).
