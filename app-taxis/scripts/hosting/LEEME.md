# TaxiYa — servidor listo para subir al hosting

Este paquete contiene el servidor de TaxiYa ya compilado: la **API**, el **tiempo real** y la **app web** (la PWA), todo en uno.
La app Android (APK) se conecta a este mismo servidor.

## Requisitos del hosting

- **Node.js 22.13 o superior** (en el panel elige la versión 22 o más nueva).
- **HTTPS** (certificado SSL, p. ej. Let's Encrypt gratis): sin él no funcionan el GPS ni la instalación de la app.
- Soporte de **WebSockets** (casi todos los hostings con Node.js lo tienen).

> ⚠️ Un hosting **solo PHP / WordPress** (sin «Node.js») **no sirve**: esta app necesita Node.js.

No hace falta base de datos aparte: los datos se guardan en el archivo `data/taxis.db` (SQLite) dentro de la carpeta de la app.
Las dependencias ya vienen incluidas en `node_modules` (no hay módulos nativos que compilar).

## 1. Configura el archivo `.env`

Copia `.env.example` como **`.env`** (si no viene ya incluido) y cambia como mínimo:

```
ADMIN_EMAIL=tu-correo@ejemplo.com
ADMIN_PASSWORD=una-contraseña-larga-y-segura
```

Con ese correo y contraseña entras como **Central** (panel de administración). Si algún día olvidas la contraseña, cámbiala en
`.env` y reinicia la app.

Los precios vienen por defecto en **pesos colombianos (COP)** y la hora en la de Colombia (`TIME_ZONE=America/Bogota`). Para limitar la
búsqueda de direcciones a Colombia añade `GEOCODER_COUNTRY_CODES=co`. Las tarifas se cambian en la Central → Tarifas.

## 2a. Hosting con cPanel / Plesk («Setup Node.js App»)

1. En el Administrador de archivos crea una carpeta, por ejemplo `taxiya`, y **sube y descomprime** este zip dentro.
2. Ve a **Setup Node.js App → Create Application**:
   - *Node.js version*: **22** (o superior)
   - *Application mode*: Production
   - *Application root*: `taxiya`
   - *Application URL*: tu dominio o subdominio (p. ej. `taxis.tudominio.com`)
   - *Application startup file*: **`app.cjs`**
3. Pulsa **Create** y después **Restart**. (No hace falta pulsar «Run NPM Install».)
4. Activa el SSL del dominio (cPanel → SSL/TLS Status → *Run AutoSSL*).
5. Abre `https://taxis.tudominio.com` y entra con el correo y la contraseña de la central.

## 2b. Servidor VPS (Ubuntu/Debian) con PM2

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
sudo npm install -g pm2

# Subir y descomprimir el zip en /opt/taxiya, configurar .env y arrancar
cd /opt/taxiya
pm2 start app.cjs --name taxiya --node-args="--disable-warning=ExperimentalWarning"
pm2 save && pm2 startup
```

La app escucha en el puerto `PORT` del `.env` (3000 por defecto). Ponle delante **Caddy** (HTTPS automático):

```
taxis.tudominio.com {
    reverse_proxy localhost:3000
}
```

o Nginx con Let's Encrypt (incluye `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` para los WebSockets).

## 2c. Render, Railway, Fly.io y similares

Sube esta carpeta (o el repositorio) y configura:
- Comando de inicio: `node app.cjs`
- Variables de entorno: las del `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`…)
- Un **disco persistente** montado en `/data` y la variable `DB_PATH=/data/taxis.db` (si no, los datos se borran en cada despliegue).

## 3. Conecta la app Android

Abre la app TaxiYa en el móvil y, cuando pida la dirección del servidor, escribe la de tu dominio: `https://taxis.tudominio.com`.

## Copias de seguridad

Guarda periódicamente la carpeta **`data/`** (contiene la base de datos y la clave de las sesiones).

## Problemas frecuentes

| Síntoma | Solución |
| --- | --- |
| La app no arranca y el registro dice `node:sqlite` o `SyntaxError` | La versión de Node.js es antigua: elige **22.13 o superior**. |
| No puedo entrar como Central | Revisa `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` y reinicia la app. |
| El mapa no pide ubicación / no aparece «Instalar» | Falta HTTPS en el dominio. |
| Los cambios de estado no llegan en tiempo real | El hosting o el proxy no deja pasar WebSockets en `/socket.io/`. |
