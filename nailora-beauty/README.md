# Nailora Beauty — Tienda online de esmaltes y productos para uñas

Aplicación web completa en **PHP 8 + MySQL** para vender esmaltes, productos para uñas,
herramientas y accesorios en Colombia, con confirmación de pedidos por **WhatsApp**.

- Tienda pública: inicio editable, catálogo con filtros y paginación en SQL, búsqueda,
  detalle de producto con galería y variantes, carrito, checkout como invitado y confirmación.
- Panel administrativo: dashboard con datos reales, productos (con variantes e imágenes),
  categorías, marcas, inventario con historial auditable, pedidos con flujo de estados,
  clientes, promociones, informes con exportación CSV, configuración, páginas legales,
  usuarios y registro de auditoría.
- Sin Node.js ni Composer obligatorios: funciona en un hosting PHP compartido con Apache.

> **Datos de demostración.** `database/seed.sql` carga productos genéricos con SKU `DEMO-…`,
> precios y existencias ficticios e ilustraciones propias. No representan marcas, proveedores,
> reseñas ni promociones reales. Retírelos antes de publicar (sección 15).

---

## Índice

1. [Requisitos del servidor](#1-requisitos-del-servidor)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Crear la base de datos](#3-crear-la-base-de-datos)
4. [Importar `schema.sql`](#4-importar-schemasql)
5. [Cargar los datos de demostración](#5-cargar-los-datos-de-demostración)
6. [Configurar las credenciales (.env)](#6-configurar-las-credenciales-env)
7. [Configurar la URL base](#7-configurar-la-url-base)
8. [Configurar WhatsApp](#8-configurar-whatsapp)
9. [Configurar HTTPS](#9-configurar-https)
10. [Crear el primer administrador](#10-crear-el-primer-administrador)
11. [Instalar en hosting compartido](#11-instalar-en-hosting-compartido)
12. [Configurar el document root](#12-configurar-el-document-root)
13. [Permisos de carpetas](#13-permisos-de-carpetas)
14. [Protección de archivos internos](#14-protección-de-archivos-internos)
15. [Crear productos](#15-crear-productos)
16. [Administrar el inventario](#16-administrar-el-inventario)
17. [Gestionar pedidos](#17-gestionar-pedidos)
18. [Copias de seguridad](#18-copias-de-seguridad)
19. [Solución de errores comunes](#19-solución-de-errores-comunes)
20. [Funciones que requieren configuración adicional y limitaciones](#20-funciones-que-requieren-configuración-adicional-y-limitaciones)
21. [Seguridad implementada](#21-seguridad-implementada)
22. [Modelo de datos](#22-modelo-de-datos)
23. [Pruebas](#23-pruebas)
24. [Desarrollo local](#24-desarrollo-local)

---

## 1. Requisitos del servidor

| Requisito | Detalle |
|---|---|
| PHP | 8.1 o superior (recomendado 8.2+) |
| Extensiones PHP | `pdo_mysql`, `mbstring`, `fileinfo`, `session`; **`gd` recomendada** (redimensiona y re-codifica imágenes a WebP) |
| Base de datos | MySQL 8.0+ o MariaDB 10.5+ (InnoDB, `utf8mb4`) |
| Servidor web | Apache 2.4 con `mod_rewrite` y `AllowOverride All` (también `mod_headers`, `mod_expires`, `mod_deflate` opcionales) |
| Otros | HTTPS recomendado en producción |

## 2. Estructura del proyecto

```
nailora-beauty/
├── app/
│   ├── Controllers/            Tienda (Home, Product, Cart, Checkout, Order, Install)
│   │   └── Admin/              Panel (Auth, Dashboard, Product, Category, Brand, Inventory,
│   │                           Order, Customer, Promotion, Report, Settings, Page, User, Audit)
│   ├── Core/                   Router, Request, Database (PDO), View, Session, Validator,
│   │                           Paginator, ErrorHandler, Env
│   ├── Models/                 Product, ProductVariant, Category, Brand, Order, OrderItem,
│   │                           Customer, InventoryMovement, Promotion, User, Setting, Page, AuditLog
│   ├── Services/               Cart, Checkout, Inventory, Order, Pricing, Shipping, WhatsApp,
│   │                           Upload, Report, Auth, Install
│   ├── Middleware/             AuthMiddleware, CsrfMiddleware
│   ├── Helpers/                functions.php, format.php, validation.php, icons.php
│   ├── Views/                  layouts, components, storefront, cart, checkout, orders, pages,
│   │                           errors, install, admin/…
│   └── bootstrap.php
├── config/                     app.php, database.php, colombia.php, config.example.php
├── database/                   schema.sql, seed.sql, clear-demo.sql, migrations/
├── public/                     ← ÚNICA carpeta que debe ser pública
│   ├── index.php               Controlador frontal
│   ├── .htaccess
│   ├── assets/css|js|images
│   └── uploads/                Imágenes subidas (sin ejecución de scripts)
├── routes/                     web.php (tienda), admin.php (panel)
├── storage/                    logs/, cache/, sessions/, installed.lock
├── bin/                        install.php, create-admin.php (línea de comandos)
├── tests/run.php               Pruebas automatizadas
├── .htaccess                   Solo para hosting sin document root configurable
├── .env.example
├── composer.json               Opcional (no hay dependencias externas)
└── LICENSE
```

## 3. Crear la base de datos

Desde cPanel → **Bases de datos MySQL** (o phpMyAdmin), cree:

1. Una base de datos, por ejemplo `cuenta_nailora`, con cotejamiento `utf8mb4_unicode_ci`.
2. Un usuario con contraseña segura.
3. Asigne al usuario **todos los privilegios** sobre esa base de datos.

Por línea de comandos:

```sql
CREATE DATABASE nailora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'nailora_user'@'localhost' IDENTIFIED BY 'una-contraseña-larga';
GRANT ALL PRIVILEGES ON nailora.* TO 'nailora_user'@'localhost';
```

## 4. Importar `schema.sql`

Tiene tres opciones (todas equivalentes; el esquema es idempotente y no contiene contraseñas):

- **phpMyAdmin:** seleccione la base de datos → *Importar* → `database/schema.sql`.
- **Consola:** `mysql -u nailora_user -p nailora < database/schema.sql`
- **Instalador web** o **`php bin/install.php`** (secciones 10 y 11): importan el esquema automáticamente.

El esquema incluye valores iniciales seguros de configuración (el número de WhatsApp queda vacío).

## 5. Cargar los datos de demostración

Opcional, para probar la tienda con contenido:

- phpMyAdmin: importe `database/seed.sql` después del esquema.
- Consola: `mysql -u nailora_user -p nailora < database/seed.sql`
- Instalador web: marque *Cargar datos de demostración*; CLI: `php bin/install.php --demo`.

Se puede importar varias veces sin duplicar registros. Incluye 10 categorías, 22 productos
genéricos (uno con 4 variantes de color y uno agotado a propósito), movimientos de inventario
iniciales y textos iniciales de las páginas legales.

## 6. Configurar las credenciales (.env)

Copie `.env.example` como `.env` en la raíz del proyecto y complete:

```ini
APP_ENV=production
APP_DEBUG=false                 # nunca true en producción
APP_URL=https://www.su-dominio.com
DB_HOST=localhost
DB_DATABASE=cuenta_nailora
DB_USERNAME=cuenta_usuario
DB_PASSWORD=la-contraseña
SESSION_SECURE=auto
INSTALL_TOKEN=                  # solo durante la instalación web
```

- El archivo `.env` está en `.gitignore`: **no lo suba a ningún repositorio**.
- Si su hosting no permite archivos `.env`, defina las mismas variables de entorno desde su panel.
- Las opciones del negocio (WhatsApp, textos, envíos…) **no** van en `.env`: se editan en
  *Administración → Configuración* y se guardan en la tabla `settings`.

## 7. Configurar la URL base

`APP_URL` debe ser la dirección pública exacta, **sin barra final**:

| Instalación | APP_URL |
|---|---|
| Dominio propio | `https://www.nailorabeauty.com` |
| Subcarpeta | `https://www.su-dominio.com/tienda` |
| Local con `php -S` | `http://localhost:8000` |

Todos los enlaces, el sitemap, las etiquetas canonical y la cookie de sesión se generan a partir
de este valor.

## 8. Configurar WhatsApp

1. Ingrese al panel → **Configuración → WhatsApp**.
2. Escriba el número en formato internacional **sin `+`, espacios ni guiones**: Colombia `57`
   + 10 dígitos, por ejemplo `573001234567`. El sistema también normaliza `300 123 4567`.
3. Opcional: personalice el saludo del mensaje del pedido.

Los enlaces usan el formato oficial `https://wa.me/NUMERO?text=TEXTO` con `rawurlencode()`.
Mientras no haya número, los botones de WhatsApp no se muestran (no hay botones “muertos”).

Botones disponibles: flotante en toda la tienda, consulta por producto, consulta del carrito
(no registra pedido), envío del pedido desde la confirmación y contacto al cliente desde el panel.

**Estados claramente separados:**

| Situación | Dónde se ve |
|---|---|
| Pedido registrado en la tienda | Estado *Pendiente de confirmación* |
| El cliente pulsó “Enviar pedido por WhatsApp” | Campo *WhatsApp abierto* con fecha (no garantiza que el mensaje se enviara) |
| Pedido confirmado manualmente | Estado *Confirmado*, con usuario y fecha en el historial |

No se usa la API de WhatsApp Business: no hay envío automático de mensajes.

## 9. Configurar HTTPS

1. Active un certificado (cPanel → *SSL/TLS Status* / *AutoSSL* o Let’s Encrypt).
2. Cambie `APP_URL` a `https://…`.
3. Opcional: fuerce HTTPS agregando al inicio de `public/.htaccess` (o del `.htaccess` raíz):

   ```apache
   RewriteEngine On
   RewriteCond %{HTTPS} !=on
   RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   ```

Con `SESSION_SECURE=auto` la cookie de sesión lleva el atributo `Secure` cuando la conexión es
HTTPS, y se envía la cabecera `Strict-Transport-Security`.

## 10. Crear el primer administrador

**Opción A — Instalador web protegido (sin SSH):**

1. En `.env` defina `INSTALL_TOKEN` con 16 o más caracteres aleatorios.
2. Abra `https://su-dominio/instalar`, revise los requisitos, escriba el token y los datos del
   administrador (contraseña de 10+ caracteres con letras y números).
3. Al terminar se crea `storage/installed.lock` y el instalador queda **bloqueado** (responde 404).
4. **Borre `INSTALL_TOKEN` del `.env`.** Sin token el instalador está desactivado (403).

El instalador nunca sobrescribe tablas existentes ni crea un segundo administrador si ya hay uno.
Para volver a usarlo habría que borrar manualmente `storage/installed.lock` (no lo haga en producción).

**Opción B — Línea de comandos:**

```bash
php bin/install.php --demo          # esquema (+ demo) y bloqueo del instalador web
php bin/create-admin.php "Nombre Apellido" correo@su-dominio.com
```

La contraseña se pide de forma oculta. Más administradores: *Administración → Usuarios*.

## 11. Instalar en hosting compartido

1. Suba la carpeta `nailora-beauty` completa por el administrador de archivos o FTP
   (preferiblemente **fuera** de `public_html`, ver sección 12).
2. Cree la base de datos (sección 3).
3. Cree y complete `.env` (secciones 6–7).
4. Ajuste permisos (sección 13).
5. Ejecute el instalador web (sección 10) o importe los SQL con phpMyAdmin y cree el
   administrador con `bin/create-admin.php` si tiene SSH.
6. Ingrese a `/admin`, configure WhatsApp, textos, envíos y métodos de pago.
7. Revise las páginas legales (*Administración → Páginas*).
8. Retire los datos de demostración (sección 15) y cargue sus productos.

## 12. Configurar el document root

**Recomendado:** apunte el dominio a `nailora-beauty/public`. Así solo `public/` es accesible.

- cPanel → *Dominios* → editar el dominio → *Document Root*: `nailora-beauty/public`.
- O suba el proyecto a `/home/cuenta/nailora-beauty` y haga que `public_html` sea un enlace
  simbólico a `nailora-beauty/public` (si el hosting lo permite).

**Si no puede cambiar el document root:** suba el contenido del proyecto directamente a
`public_html`. El archivo `.htaccess` de la raíz redirige todo a `public/` y responde **403** a
`app/`, `config/`, `database/`, `routes/`, `storage/`, `bin/`, `tests/`, archivos ocultos
(`.env`, `.git`) y extensiones sensibles (`.sql`, `.md`, `.json`, `.lock`, `.log`, `.ini`).
Además, cada carpeta interna tiene su propio `.htaccess` con `Require all denied`.
En este modo `APP_URL` sigue siendo la URL del dominio (sin `/public`).

## 13. Permisos de carpetas

| Ruta | Permiso sugerido | Motivo |
|---|---|---|
| Carpetas en general | `755` | |
| Archivos en general | `644` | |
| `.env` | `640` o `600` | Contiene credenciales |
| `storage/` (y `logs/`, `sessions/`, `cache/`) | `775` (o `755` si PHP corre con su usuario) | Logs, sesiones y bloqueo del instalador |
| `public/uploads/` (y subcarpetas) | `775` (o `755`) | Imágenes subidas |

Nunca use `777`. En hostings con suPHP/PHP-FPM por usuario, `755` suele bastar.

## 14. Protección de archivos internos

- `public/index.php` es el único punto de entrada PHP.
- `public/uploads/.htaccess` desactiva el motor PHP, quita los manejadores de scripts, niega
  `.php`, `.phtml`, `.phar`, `.html`, `.svg`, `.js`… y envía una CSP restrictiva.
- Las imágenes se validan por tipo real y se guardan con nombre aleatorio (sección 21).
- Las sesiones se guardan en `storage/sessions`, fuera del alcance web.
- Los errores técnicos se registran en `storage/logs/` y nunca se muestran al visitante
  (salvo `APP_DEBUG=true`, solo para desarrollo).

Verificado con Apache 2.4 en ambas modalidades: `/.env`, `/app/…`, `/config/…`,
`/database/schema.sql`, `/storage/…` devuelven 403/404 y un `.php` dentro de `uploads/` no se ejecuta.

## 15. Crear productos

1. **Categorías** (*Catálogo → Categorías*): nombre, URL, descripción, imagen, orden y estado.
   No se puede eliminar una categoría con productos (desactívela o reasigne los productos).
2. **Marcas** (opcional): regístrelas solo si son marcas reales que comercializa. La sección de
   marcas aparece en la tienda cuando hay marcas activas con productos.
3. **Productos → Nuevo producto:** nombre, SKU único, categoría, tipo (alimenta el filtro del
   catálogo), descripciones, precio de venta, precio anterior (opcional, debe ser mayor), costo
   (privado), existencias iniciales, alerta de stock bajo, estado, destacado, “Nuevo”, SEO e imágenes.
4. **Variantes:** marque *Este producto tiene variantes*, guarde y agregue cada opción (nombre,
   SKU, color hexadecimal opcional, precio opcional y existencias iniciales). Cada variante tiene
   inventario propio; el cliente debe elegir una para comprar.
5. **Imágenes:** JPG, PNG o WebP de hasta `UPLOAD_MAX_MB` (4 MB por defecto). Se redimensionan a
   1600 px y se convierten a WebP si GD lo permite. Puede elegir la principal y eliminar imágenes.
6. **Duplicar** crea una copia inactiva y sin existencias para revisarla antes de publicar.
7. **Eliminar:** solo se borra físicamente un producto sin pedidos ni movimientos de inventario;
   en caso contrario se **desactiva** para conservar la integridad del historial.

**Retirar los datos de demostración:** haga una copia de seguridad y ejecute
`database/clear-demo.sql` (phpMyAdmin → SQL, o `mysql … < database/clear-demo.sql`).
Desactiva todos los productos `DEMO-` y elimina los que no estén en ningún pedido.
Los pedidos de prueba que haya creado puede cancelarlos desde el panel.

## 16. Administrar el inventario

**Política de stock (decisión de diseño):**

- El stock se **descuenta al registrar el pedido** (estado *Pendiente*), dentro de la misma
  transacción que crea el pedido y con bloqueo de filas (`SELECT … FOR UPDATE`), de modo que
  dos clientes no pueden comprar la última unidad a la vez.
- Al **cancelar** un pedido el stock se devuelve **una sola vez**: el pedido pasa a
  `stock_status = released` y una restricción única en la base de datos impide registrar dos
  devoluciones de la misma línea.
- Los pedidos pendientes mantienen las unidades apartadas: cancele los que no se concreten.
- Nunca se permiten existencias negativas (validación en PHP y `CHECK`/`UNSIGNED` en MySQL).

**Movimientos manuales** (*Inventario → Registrar movimiento*): entrada por compra/reposición,
entrada por devolución de cliente, salida por daño, salida por pérdida y ajuste por conteo
(fija la cantidad contada). El motivo es obligatorio y se guarda: fecha, administrador,
cantidad anterior, cambio, cantidad final y referencia opcional.

El historial (*Inventario → Historial*) es de solo lectura y filtra por producto, tipo y fechas.
Para corregir un error se registra un nuevo ajuste; ninguna ruta permite editar o borrar
movimientos. Las existencias del producto no se editan en su formulario, solo por movimientos.

## 17. Gestionar pedidos

*Pedidos* lista los pedidos con búsqueda por código, nombre o teléfono, pestañas por estado,
filtro de fechas y exportación CSV.

Flujo de estados permitido:

```
Pendiente → Confirmado → En preparación → Enviado → Entregado
    ↘            ↘              ↘
     Cancelado    Cancelado      Cancelado
```

*Entregado* y *Cancelado* son finales. Cada cambio guarda fecha, usuario, estado anterior y
nuevo, y una nota opcional. En el detalle del pedido también puede:

- Registrar observaciones internas (solo visibles para el equipo).
- Definir el **costo de envío** cotizado (recalcula el total).
- Marcar el pago como *Pagado (verificado manualmente)* o *Reembolsado*.
- Abrir WhatsApp con el cliente e **imprimir** una orden interna.

El cliente ve su confirmación en `/pedido/NB-AAAA-000000?t=TOKEN`: el token secreto evita que
otras personas vean sus datos con solo adivinar el código.

## 18. Copias de seguridad

Respalde **la base de datos** y la carpeta **`public/uploads/`** (y su `.env` en un lugar seguro).

```bash
mysqldump -u nailora_user -p --single-transaction --routines nailora > respaldo-$(date +%F).sql
tar czf uploads-$(date +%F).tar.gz public/uploads
```

En cPanel use *Copias de seguridad* o phpMyAdmin → *Exportar*. Programe respaldos al menos
semanales y guarde copias fuera del servidor. Para restaurar: importe el `.sql` y copie `uploads/`.

## 19. Solución de errores comunes

| Síntoma | Causa probable y solución |
|---|---|
| Página en blanco o “Ocurrió un error inesperado” | Revise `storage/logs/app-AAAA-MM.log` y `php-AAAA-MM.log`. Temporalmente `APP_DEBUG=true` (luego vuelva a `false`). |
| “No se pudo conectar a la base de datos” | Datos `DB_*` incorrectos en `.env`; en cPanel el nombre lleva prefijo de cuenta (`cuenta_nailora`). |
| 404 en todas las páginas excepto el inicio | `mod_rewrite` desactivado o `AllowOverride None`. Active ambos o pida soporte al hosting. |
| Estilos sin cargar / enlaces rotos | `APP_URL` no coincide con la dirección real (http/https, www, subcarpeta). |
| “La sesión del formulario expiró” (419) | El formulario estuvo abierto mucho tiempo o se borraron las cookies. Recargue la página. |
| No se suben imágenes | Permisos de `public/uploads`, `upload_max_filesize`/`post_max_size` de PHP menores a `UPLOAD_MAX_MB`, o formato no permitido. |
| “Demasiados intentos fallidos” en el login | 5 intentos fallidos en 15 minutos por correo (o 20 por IP). Espere el tiempo indicado. |
| El instalador responde 403 | `INSTALL_TOKEN` vacío o de menos de 16 caracteres (es el comportamiento esperado tras instalar). |
| El instalador responde 404 | Ya existe `storage/installed.lock`: la instalación está bloqueada. |
| No aparecen botones de WhatsApp | Falta el número en *Configuración → WhatsApp*. |
| Un producto no se muestra | Producto o categoría inactivos; productos con variantes necesitan al menos una variante activa con stock para venderse. |
| Horas desfasadas | Ajuste `APP_TIMEZONE` (por defecto `America/Bogota`). |

## 20. Funciones que requieren configuración adicional y limitaciones

Estas limitaciones son reales y están documentadas a propósito:

- **Pagos en línea:** no hay pasarela integrada. No se cobra ni se almacenan datos de tarjetas;
  el pago se acuerda por WhatsApp y se marca manualmente. El campo `payment_method` y el estado
  `payment_status` dejan preparada la arquitectura para integrar Wompi, Mercado Pago u otros
  (crear un servicio de pago y un webhook que marque el pedido como pagado tras verificar la firma).
- **Envíos:** costo *por confirmar* o *tarifa fija nacional* con envío gratis opcional. No hay
  tarifas por ciudad ni integración con transportadoras.
- **WhatsApp:** enlaces `wa.me`, sin API de WhatsApp Business ni mensajes automáticos.
- **Correo electrónico:** la tienda no envía correos (no hay SMTP configurado).
- **Cuentas de clientes:** compra solo como invitado; los clientes se agrupan por celular.
- **Cupones:** las promociones son automáticas por producto, categoría o toda la tienda; no hay códigos de cupón.
- **Newsletter y reseñas:** no se implementaron para no simular funciones sin backend.
- **Roles:** un único rol de administrador con acceso completo.
- **Pedidos pendientes:** no se cancelan automáticamente; revise y cancele los que no se concreten.
- **Filtro de precio del catálogo:** usa el precio de lista (“desde” en productos con variantes),
  no el precio con promoción.
- **Inmutabilidad del historial:** la aplicación no ofrece edición ni borrado de movimientos de
  inventario o del historial de estados; un usuario con acceso directo a la base de datos sí
  podría alterarlos (no se usan triggers porque muchos hostings compartidos no los permiten).
- **Fuentes:** se cargan desde Google Fonts; si se bloquean se usan tipografías del sistema.
- **Fotografías:** el proyecto incluye ilustraciones vectoriales propias como imágenes de
  demostración y de portada; reemplácelas con fotografías reales desde el panel.

## 21. Seguridad implementada

- PDO con consultas preparadas, `ERRMODE_EXCEPTION` y emulación de *prepared statements* desactivada.
- Escape de toda salida HTML con `htmlspecialchars` (`e()`); los textos editables usan un formato
  propio sin HTML.
- Token CSRF obligatorio en **todas** las peticiones POST (formularios y Fetch).
- Sesiones con `use_strict_mode`, cookies `HttpOnly` y `SameSite=Lax`, `Secure` con HTTPS;
  ID regenerado al iniciar sesión y al cambiar contraseña; expiración por inactividad del panel.
- Contraseñas con `password_hash`/`password_verify` (rehash automático), política de 10+
  caracteres con letras y números, mensajes de login que no revelan si el correo existe y
  limitación de intentos por correo e IP.
- Autorización verificada en el backend en cada ruta `/admin` (se revalida que el usuario siga activo).
- Precios, descuentos, envío y stock calculados siempre en el servidor; el navegador solo envía ids y cantidades.
- Transacciones y bloqueos de fila en pedidos, cancelaciones y movimientos de inventario.
- Pedidos idempotentes (token de checkout único en sesión y en la base de datos).
- Cabeceras: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy y HSTS con HTTPS.
- Subidas: tipo MIME real (finfo + getimagesize), extensión según el tipo detectado, tamaño y
  dimensiones máximas, nombre aleatorio, re-codificación con GD, carpetas fijas y PHP desactivado.
- Exportación CSV protegida contra inyección de fórmulas.
- Registro de auditoría de acciones administrativas (inicio de sesión, cambios de productos,
  inventario, pedidos, configuración, usuarios).

## 22. Modelo de datos

| Tabla | Propósito | Relaciones principales |
|---|---|---|
| `users` | Administradores | — |
| `login_attempts` | Limitación de intentos de login | — |
| `categories` | Categorías del catálogo | 1‑N `products` (RESTRICT) |
| `brands` | Marcas (opcional) | 1‑N `products` (SET NULL) |
| `products` | Productos; `stock` propio si no tiene variantes | `product_images`, `product_variants` |
| `product_images` | Galería | N‑1 `products` (CASCADE) |
| `product_variants` | Variantes con SKU, precio y stock propios | N‑1 `products` |
| `customers` | Clientes (únicos por celular normalizado) | 1‑N `orders` (RESTRICT) |
| `orders` | Pedidos: datos de entrega, totales, estado, pago, stock | `order_items`, `order_status_history`, `order_notes` |
| `order_items` | Copia inmutable de nombre, SKU, precio, descuento y cantidad | product/variant SET NULL |
| `order_status_history` | Cambios de estado con usuario y nota | N‑1 `orders` |
| `order_notes` | Observaciones internas | N‑1 `orders` |
| `inventory_movements` | Libro de movimientos de stock | product/variant/order RESTRICT; único (pedido, tipo, línea) |
| `promotions`, `promotion_products`, `promotion_categories` | Descuentos automáticos por fechas | — |
| `settings` | Configuración clave/valor | — |
| `pages` | Páginas informativas y legales | — |
| `audit_logs` | Auditoría de acciones | N‑1 `users` (SET NULL) |

Precios en `DECIMAL(12,2)`, existencias `INT UNSIGNED`, restricciones `CHECK` para valores
negativos, índices en SKU, slug, estados, fechas, categoría y código de pedido.

## 23. Pruebas

```bash
# Requiere una base de datos de PRUEBA (se borra y recrea en cada ejecución)
mysql -u root -e "CREATE DATABASE nailora_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
TEST_DB_DATABASE=nailora_test php tests/run.php
```

70 pruebas cubren: instalación idempotente, validaciones y formatos, precios y promociones
(vigencia, tope del 90 %, sin negativos), carrito (stock, agotados, variantes), checkout
transaccional (código único, copia de precios, descuento de stock, idempotencia, rechazo sin
stock), enlace de WhatsApp, hashing de contraseñas, transiciones de estado, cancelación sin
doble devolución, movimientos de inventario y subida segura de imágenes.

Verificación de sintaxis: `composer lint` o
`find app config routes public bin tests -name '*.php' -exec php -l {} \;`

## 24. Desarrollo local

```bash
cp .env.example .env        # APP_URL=http://localhost:8000, APP_DEBUG=true, datos de su MySQL local
php bin/install.php --demo
php bin/create-admin.php "Admin" admin@ejemplo.com
php -S localhost:8000 -t public public/index.php
```

Tienda: <http://localhost:8000> · Panel: <http://localhost:8000/admin>
