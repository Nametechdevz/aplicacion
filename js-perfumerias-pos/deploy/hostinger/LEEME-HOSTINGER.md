# Instalación en Hostinger — JS Perfumerías POS

El ZIP contiene dos carpetas:

```
public_html/   → lo único visible en internet (index.php, estilos, imágenes)
js-pos/        → el código, la configuración (.env) y los registros; NO es accesible desde la web
```

Ambas deben quedar **una al lado de la otra** dentro de la carpeta de su dominio:

```
/home/uXXXXXXX/domains/su-dominio.com/
├── public_html/
└── js-pos/
```

## 0. ¿Dominio principal o subdominio? (importante)

Cada dominio o subdominio tiene su **carpeta raíz**. Para saber cuál es:
hPanel → **Dominios → Subdominios** (columna *Carpeta*) o, si el subdominio es un sitio aparte,
**Sitios web → Administrar → Administrador de archivos**.

| Caso | Carpeta raíz típica | Dónde va el contenido de `public_html/` del ZIP | Dónde va `js-pos/` |
|---|---|---|---|
| Dominio principal | `domains/midominio.com/public_html` | dentro de esa carpeta | `domains/midominio.com/js-pos` |
| Subdominio dentro del dominio | `domains/midominio.com/public_html/pos` | **dentro de `public_html/pos`** | `domains/midominio.com/js-pos` |
| Subdominio como sitio aparte | `domains/pos.midominio.com/public_html` | dentro de esa carpeta | `domains/pos.midominio.com/js-pos` |

El `index.php` busca `js-pos` automáticamente en su misma carpeta y hasta tres niveles arriba,
así que basta con que `js-pos` quede **en la carpeta del dominio** (fuera del acceso web).

**Prueba rápida:** abra `https://su-subdominio/index.php`.
- Si ve la página **404 morada de Hostinger**, el `index.php` no está en la carpeta raíz correcta.
- Si ve “Falta la carpeta js-pos”, mueva `js-pos` como indica la tabla.
- Si ve el inicio de sesión de JS Perfumerías, todo está en su lugar.

Active **“Mostrar archivos ocultos”** en el Administrador de archivos y confirme que `.htaccess`
está dentro de la carpeta raíz junto a `index.php`; sin él, todas las rutas dan 404.

## 1. Preparar en hPanel

1. **Sitios web → Administrar → Avanzado → Configuración de PHP:** seleccione **PHP 8.3**
   (o superior). En *Extensiones PHP* verifique que estén activas `pdo_mysql`, `gd`, `mbstring`,
   `fileinfo` e `intl`.
2. **Bases de datos → Bases de datos MySQL:** cree una base de datos y un usuario. Anote los tres
   datos que muestra Hostinger (nombre de la base `u123_xxx`, usuario `u123_xxx` y contraseña).
3. **Seguridad → SSL:** instale el certificado SSL gratuito y active *Forzar HTTPS*.

## 2. Subir los archivos

1. **Archivos → Administrador de archivos.** Entre a `domains/su-dominio.com/`
   (la carpeta que **contiene** `public_html`, no dentro de ella).
2. Si `public_html` tiene archivos de ejemplo de Hostinger (`default.php`, `index.html`), bórrelos.
3. Suba `js-perfumerias-pos-hostinger.zip` en esa carpeta y use **Extraer**. Debe ver
   `public_html/` y `js-pos/` lado a lado. Luego puede borrar el ZIP.

## 3. Configurar `.env`

1. En `js-pos/`, copie `.env.example` y renombre la copia como `.env`.
2. Edítelo y complete:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://su-dominio.com
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=u123_xxx        (los datos del paso 1.2)
DB_USERNAME=u123_xxx
DB_PASSWORD=la-contraseña-de-la-base
SESSION_SECURE=true
```

## 4. Crear las tablas y el primer superadministrador

**Opción A — con SSH** (hPanel → Avanzado → Acceso SSH):

```bash
cd ~/domains/su-dominio.com/js-pos
php bin/migrate.php
php bin/create-superadmin.php
```

**Opción B — sin SSH (instalador web de un solo uso):**

1. En `.env` agregue una línea con un código aleatorio largo (32 caracteres o más), por ejemplo:
   `INSTALL_TOKEN=7f3k9Qz2Lm8Xw4Rt6Yp1Nb5Vc0Hs3Jd`
2. Abra `https://su-dominio.com/install`, escriba ese código y los datos del superadministrador.
   El instalador crea todas las tablas y la cuenta.
3. **Borre la línea `INSTALL_TOKEN` del `.env`.** (La página `/install` ya deja de funcionar en
   cuanto existe un superadministrador, pero no deje el código guardado.)

Alternativa manual: importar `js-pos/database/schema.sql` en **phpMyAdmin** y luego usar el
instalador web solo para crear la cuenta.

## 5. Listo

Entre a `https://su-dominio.com`, inicie sesión y configure en este orden:
**Configuración** (datos de la empresa) → **Sucursales** → **Usuarios** → **Categorías y marcas** →
**Productos** (con fotos) → **Inventario → Entrada** (existencias iniciales en el almacén) →
**Distribuir a sucursales** → cada cajero abre su caja en **Punto de venta**.

## Copias de seguridad

- hPanel → **Archivos → Copias de seguridad** genera copias diarias de archivos y bases de datos.
- Con SSH también puede usar `js-pos/bin/backup.sh` y programarlo en **Avanzado → Cron jobs**:
  `/bin/bash /home/uXXXXXXX/domains/su-dominio.com/js-pos/bin/backup.sh`

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| Error 500 en blanco | Revise `js-pos/storage/logs/` y que PHP sea 8.3. Temporalmente puede poner `APP_DEBUG=true` para ver el detalle (vuelva a `false`). |
| "Access denied for user" | Datos de base incorrectos en `.env` (Hostinger usa `localhost`). |
| La sesión se cierra al iniciar | Si aún no tiene SSL, use `SESSION_SECURE=false` hasta activarlo. |
| No suben las imágenes | Permisos: `public_html/uploads/products` y `js-pos/storage` en 755. Verifique `gd` activo. |
| Página 404 en todas las rutas | Falta `public_html/.htaccess` (archivo oculto): active "mostrar archivos ocultos" y verifique que se extrajo. |
