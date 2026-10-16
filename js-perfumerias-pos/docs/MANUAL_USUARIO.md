# Manual básico de usuario — JS Perfumerías POS

## Ingreso
Escriba su usuario y contraseña. Tras varios intentos fallidos el acceso se bloquea temporalmente.
La sucursal activa se muestra al pie del menú lateral; puede cambiarla si tiene varias asignadas.
El ícono de luna/sol alterna modo claro y oscuro. `Ctrl K` abre la búsqueda global.

## Cajero: vender
1. **Abrir caja:** en *Punto de venta* (o *Caja*) elija la caja y el fondo inicial.
2. **Agregar productos:** toque la tarjeta, busque por nombre/código o escanee el código de barras
   (el lector funciona como teclado; `F2` enfoca la búsqueda).
   - Productos a granel (ml, g): el sistema pide la cantidad (por ejemplo, 35 ml) o una presentación.
3. **Cantidades:** use `+`/`−` o escriba la cantidad. `Supr` quita la línea seleccionada.
4. **Cliente:** `F4` para buscar o registrar un cliente (opcional).
5. **Descuento:** `F8` o *Descuento* en la línea: porcentaje, valor fijo o precio final. Si supera su
   límite, se envía una **solicitud de autorización**: un supervisor la aprueba desde
   *Autorizaciones* o escribe su usuario y contraseña en la misma caja.
6. **Cobrar:** `F9`. Elija medio(s) de pago, use los botones de efectivo rápido y verifique el
   cambio. Las transferencias, Nequi y tarjetas requieren referencia y quedan *pendientes de
   verificación manual*. `Enter` confirma.
7. **Comprobante:** *Imprimir* (formato 80 mm). Las reimpresiones quedan registradas.

El carrito se conserva si la página se recarga. Si la conexión falla al confirmar, puede reintentar:
la venta no se duplica.

## Cierre de turno
En *Caja → Cerrar turno* cuente el efectivo por denominación; el sistema muestra esperado y
diferencia. Si hay diferencia, explíquela en observaciones. El supervisor aprueba el cierre.

## Administrador de sucursal
- **Ventas:** filtros por fecha, vendedor, medio de pago y estado; clic en una fila abre el detalle
  (artículos, descuentos y quién autorizó, pagos, devoluciones). Puede **anular** ventas de turnos
  abiertos (con motivo) o registrar **devoluciones**.
- **Autorizaciones:** apruebe o rechace descuentos; se muestra el margen resultante.
- **Inventario:** existencias, reservado, en tránsito y mínimos; ajustes y conteos si tiene el permiso.
- **Transferencias:** solicite mercancía y confirme la recepción indicando lo realmente recibido.
- **Usuarios:** cree cajeros de su sucursal. **Reportes:** solo de sus sucursales.

## Superadministrador
- **Panel:** indicadores y gráficas por periodo, sucursal y vendedor.
- **Productos:** fotografías, unidad base, forma de venta, precios, costo, precio mínimo,
  descuento máximo y presentaciones. Cada cambio de precio queda en el historial.
- **Inventario central:** *Entrada* (inventario inicial), *Distribuir a sucursales* (matriz con
  sugerencia de reposición), conteos y movimientos.
- **Compras:** órdenes, recepción total o parcial (actualiza costo promedio) y devoluciones a proveedor.
- **Sucursales, usuarios y roles, configuración** (límites de descuento, medios de pago,
  políticas), **auditoría** y **reportes** con exportación CSV.
