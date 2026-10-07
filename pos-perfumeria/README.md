# POS Perfumería + Facturación Electrónica DIAN 🇨🇴

Sistema de punto de venta para perfumerías, con inventario, caja y facturación electrónica para Colombia (factura electrónica de venta, documento equivalente electrónico POS y notas crédito).

Usa **PHP 8 + MySQL** y no requiere Composer ni Node. Funciona en cualquier hosting con cPanel o en un PC de la tienda (XAMPP/Laragon). Todas las librerías (Bootstrap, Chart.js, QR y códigos de barras) vienen incluidas, así que **el POS sigue funcionando aunque se caiga el internet**.

---

## ✨ Funcionalidades

| Módulo | Qué hace |
|---|---|
| **Punto de venta** | Lector de código de barras (también acepta `3*código` para cantidad), catálogo táctil con filtros por categoría y género, descuentos por línea y global, pago mixto (efectivo, tarjeta, Nequi, Daviplata, transferencia, bono), cálculo de cambio, botones de efectivo rápido, creación de clientes al vuelo, atajos de teclado (F2 buscar, F4 cliente, F9 cobrar) y conservación del carrito si se recarga la página. |
| **Facturación electrónica** | Documento equivalente electrónico POS (CUDE) y factura electrónica de venta (CUFE). Genera el XML UBL 2.1, el código QR y el SoftwareSecurityCode. Permite reenviar documentos y descargar el XML. El CUFE está verificado contra el ejemplo oficial del Anexo Técnico de la DIAN. |
| **Devoluciones** | Notas crédito parciales o anulación total. Devuelven el stock y, si el reembolso es en efectivo, lo descuentan de la caja. |
| **Caja** | Apertura con base, ingresos/egresos, arqueo por medio de pago, cierre con diferencia (sobrante/faltante) e impresión del cierre en 80 mm. |
| **Productos** | Marca, categoría, género, concentración (EDP, EDT, Parfum…), ml, familia olfativa, costo, precio con IVA, margen, imagen, importación/exportación CSV e impresión de etiquetas con código de barras. |
| **Inventario** | Kárdex completo, alertas de stock mínimo, días de inventario, valorización, ajustes por conteo físico, compras a proveedores con costo promedio ponderado. |
| **Clientes** | Tipos de documento DIAN, DV automático del NIT, régimen y responsabilidades fiscales, historial y fragancias favoritas, enlace a WhatsApp. |
| **Reportes** | Ventas brutas y netas, utilidad y margen, ventas por día, hora, medio de pago, cajero, marca y categoría, productos más vendidos, informe de IVA y exportación a CSV/Excel. |
| **Usuarios** | Roles Administrador y Cajero. El cajero no ve costos ni reportes y tiene un descuento máximo configurable. |
| **Impresión** | Ticket 80 mm y formato carta (para guardar en PDF) con QR, CUFE/CUDE, resolución y valor en letras. |

## 🚀 Instalación

### Opción A: hosting con cPanel
1. Sube la carpeta `pos-perfumeria` al hosting.
2. En **cPanel → MySQL Databases**, crea una base de datos y un usuario.
3. En **phpMyAdmin**, importa `database/schema.sql` y luego `database/seed.sql`.
4. Copia `config/config.example.php` como `config/config.php` y escribe los datos de la base de datos.
5. Apunta el dominio a la carpeta `public/`. Si el hosting no lo permite, el `.htaccess` de la raíz redirige automáticamente.

### Opción B: consola / PC de la tienda
```bash
cp config/config.example.php config/config.php   # edita usuario/clave de MySQL
php bin/install.php                              # crea BD, tablas y datos de ejemplo
php -S 0.0.0.0:8000 -t public public/index.php    # o usa Apache/XAMPP apuntando a public/
```

**Usuarios iniciales** (cámbialos en *Mi perfil*):
- `admin@perfumeria.com` / `admin123`
- `cajero@perfumeria.com` / `cajero123`

## ⚙️ Primeros pasos
1. **Configuración → Empresa**: NIT, razón social, dirección y código DANE del municipio.
2. **Configuración → Resoluciones**: registra tus numeraciones DIAN (FEV y POS). Los datos de ejemplo usan el rango de pruebas `SETP`.
3. **Productos**: créalos uno a uno o impórtalos por CSV. Exporta primero para obtener la plantilla.
4. **Caja → Abrir caja** y ¡a vender!

## 🧾 Facturación electrónica: cómo pasar a producción

El sistema calcula todo lo que exige la DIAN (CUFE/CUDE, XML UBL 2.1 y QR), pero para que un documento tenga validez legal debe **firmarse con el certificado digital de la empresa y enviarse a la DIAN**. Hay dos caminos:

1. **Proveedor tecnológico (recomendado):** contratas uno autorizado por la DIAN, que firma y envía por API. En *Configuración → Facturación electrónica* eliges el conector **Proveedor tecnológico** y escribes la URL y el token. Como cada proveedor tiene su propio formato de API, ajusta `mapRequest()` y `mapResponse()` en `app/Services/Dian/Drivers/ProviderApiDriver.php` según su documentación.
2. **Software propio:** te habilitas ante la DIAN como software propio y agregas un driver que firme el XML (XAdES-EPES) y lo envíe al web service SOAP de la DIAN. La interfaz `DriverInterface` ya está lista para conectarlo.

Mientras tanto, el conector **Simulación** valida los documentos localmente y los marca como aceptados **sin enviarlos**, para operar y capacitar al personal. El sistema muestra un aviso amarillo mientras esté en simulación o en ambiente de pruebas.

> ⚠️ Antes de facturar en producción, valida con tu contador y con tu proveedor tecnológico la estructura final del XML de cada tipo de documento (en especial el documento equivalente POS, Resolución 000165 de 2023).

## 🗂️ Estructura
```
app/
  Controllers/     Lógica de cada pantalla
  Core/            Router, BD, autenticación, CSRF, vistas
  Services/        Ventas, notas crédito, inventario, caja
  Services/Dian/   CUFE/CUDE, XML UBL 2.1, conectores DIAN
  Views/           Plantillas (Bootstrap 5)
database/          schema.sql + seed.sql
public/            index.php, assets, imágenes de productos
storage/xml        XML generados (respáldalos: la DIAN exige conservarlos)
```

## 🔒 Seguridad
Contraseñas con `password_hash`, protección CSRF en todos los formularios, consultas preparadas (PDO), bloqueo tras 5 intentos fallidos de inicio de sesión, cierre de sesión por inactividad, carpetas internas bloqueadas por `.htaccess` y subida de imágenes validada.
