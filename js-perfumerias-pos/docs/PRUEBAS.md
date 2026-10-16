# Pruebas — JS Perfumerías POS

## Automatizadas

```bash
php tests/run.php
```

Crea una base aislada `<DB_DATABASE>_test`, aplica las migraciones, carga datos mínimos y ejecuta
40 pruebas unitarias y de integración (incluye peticiones HTTP simuladas contra el enrutador real y
una prueba de concurrencia con procesos paralelos `pcntl_fork`).

| # | Criterio de aceptación | Prueba |
|---|---|---|
| 1 | Un cajero no accede al inventario de otra sucursal | HTTP 403 en `/inventory?branch=…`, cambio de sucursal y detalle de venta ajenos |
| 2 | Sin permiso no se modifican precios base | `ProductService::update` lanza 403; precio sin cambios |
| 3 | Descuento sobre el límite exige autorización | Venta rechazada; con aprobación se registra quién autorizó; no se reutiliza; no se autoaprueba |
| 4 | La venta descuenta el inventario correcto | Solo cambia la sucursal de la venta |
| 5 | 35 ml descuentan exactamente 35 ml | 1.000 → 965 ml, precio por ml, descuento e importe en la línea |
| 6 | Ventas simultáneas no venden el mismo stock | Dos procesos compiten por la última unidad: solo uno vende |
| 7 | Transferencias no duplican existencias | Existencia + tránsito constante; doble despacho/recepción rechazados; diferencias resueltas |
| 8 | Recepción parcial | La orden no mueve inventario; se suma solo lo recibido; exceso rechazado |
| 9 | Devolución ≤ vendido − devuelto | Exceso rechazado; dañados no reingresan; venta original intacta |
| 10 | Pagos = total | Pago insuficiente y electrónico excedido rechazados; pago mixto con cambio |
| 11 | Solicitud duplicada no crea dos ventas | Mismo `client_request_id` devuelve la misma venta |
| 12 | Cierre calcula diferencias | Esperado, contado y diferencia; turno cerrado inmutable; sin caja no se vende |
| 13 | Reportes respetan filtros y permisos | Totales por sucursal; exportación de otra sucursal 403; permiso financiero negado |
| 14 | Cambios de precio no alteran ventas | Snapshot de nombre y precio; historial y auditoría; anulación compensatoria |
| 15 | Archivos subidos no ejecutan código | PHP disfrazado rechazado; imagen con código re-codificada a WebP limpia; carpeta sin ejecución |
| + | Seguridad | CSRF 419, bloqueo por fuerza bruta, hash de contraseñas, auditoría, escape HTML |

## Verificación de interfaz (realizada)

Se recorrieron todas las pantallas con Playwright/Chromium para los tres roles (superadministrador,
administrador de sucursal y cajero) en escritorio (1440 px) y móvil (390 px), revisando: código de
estado HTTP, errores de JavaScript, avisos de PHP y desbordamiento horizontal. Los accesos no
permitidos devuelven 403 según el rol. El flujo de venta completo (producto por unidad, granel por
ml, descuento, cobro con efectivo y cambio, comprobante) se probó en escritorio, tableta y móvil.

## Pruebas manuales recomendadas antes de producción

1. Lector de código de barras real: escanear un producto y una presentación (deben agregarse solos).
2. Impresora térmica de 80 mm: imprimir y reimprimir un comprobante.
3. Cobro mixto Nequi + efectivo con referencia; revisar *Reportes → Cobros por medio de pago*.
4. Descuento del 15 % por un cajero: autorizar desde otro equipo en *Autorizaciones* y por
   credenciales del supervisor en la misma caja.
5. Distribución desde el almacén a dos sucursales y recepción con una diferencia; resolverla.
6. Compra con recepción parcial y costo adicional; verificar el costo promedio en el producto.
7. Devolución en efectivo con caja abierta; verificar el efectivo esperado del cierre.
8. Cierre de caja con diferencia y aprobación por el supervisor.
9. Restaurar una copia de seguridad en un servidor de prueba.
