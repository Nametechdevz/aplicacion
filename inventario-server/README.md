# Inventario Pro — Servidor y panel web (PHP + MySQL)

Servidor para la app Android **Inventario Pro**. Se instala en cualquier hosting con cPanel
(PHP 7.4 o superior y MySQL/MariaDB).

- **Cada usuario (revendedor) tiene su propio inventario, clientes, ventas y marca**, y puede
  abrirlos desde varios dispositivos. Nadie ve los datos de otro.
- **Administrador**: crea los usuarios, les pone fecha de vencimiento del acceso (+1 mes con un
  clic), los activa o desactiva, ve la actividad y publica actualizaciones de la app.
- **Panel web** (`panel.php`): resumen, inventario, clientes, ventas con gráfica, actividad y
  cambio de contraseña.

## Instalación (una sola vez)

1. **Base de datos**: en cPanel → *Bases de datos MySQL*, cree una base de datos y un usuario con
   contraseña, y asigne el usuario a la base con **todos los privilegios**.
2. **Subir archivos**: en cPanel → *Administrador de archivos*, entre a la carpeta raíz del dominio
   `whatsflow.gdsmanager.com`, suba el ZIP `InventarioPro-hosting-*.zip` y use **Extraer** (los
   archivos `api.php`, `panel.php`… deben quedar en la raíz, no dentro de otra carpeta).
3. **Instalar**: abra `https://whatsflow.gdsmanager.com/install.php`, escriba los datos de la base
   de datos y su usuario administrador, y pulse *Instalar*.
4. **Seguridad**: elimine `install.php` desde el administrador de archivos.
5. **App**: la app trae fija la dirección `https://whatsflow.gdsmanager.com` (se cambia en
   `inventario-android/app/build.gradle.kts`, campo `SERVER_URL`). Cada usuario solo escribe su
   usuario y contraseña. El panel web queda en esa misma dirección.

Active el certificado SSL gratuito del hosting (*SSL/TLS* o *Let's Encrypt*) para usar `https://`.

## Actualizar (nueva versión de la app o del servidor)

Suba el ZIP nuevo a la misma carpeta y **extráigalo encima** (acepte reemplazar). No se pierde nada:
la base de datos y `config.php` no se tocan. El ZIP trae el APK nuevo en `updates/`, así que todas
las apps instaladas mostrarán el aviso **«Nueva versión disponible»** y se actualizarán encima sin
perder datos. También se puede publicar una versión desde el panel → *Actualizaciones*.

## Archivos

| Archivo | Para qué |
|---|---|
| `install.php` | Instalador (elimínelo después de instalar) |
| `panel.php` | Panel web |
| `api.php` | API que usa la app |
| `lib.php` | Funciones comunes (base de datos, sesiones) |
| `config.php` | Lo crea el instalador (datos de la base de datos). **No lo comparta** |
| `updates/` | APK publicado y `release.json` |
