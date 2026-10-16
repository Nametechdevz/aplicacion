# Arquitectura — JS Perfumerías POS

## Capas

```
Navegador ──► public/index.php ──► App (sesión, CSRF, errores, cabeceras de seguridad)
                                   └► Router (ruta + middleware auth / perm:…)
                                       └► Controller (entrada/salida HTTP, vistas o JSON)
                                           └► Service (reglas de negocio, transacciones, auditoría)
                                               └► Database (PDO, consultas preparadas)
```

- **Controladores** delgados: leen la petición, llaman a un servicio y responden.
- **Servicios** concentran las reglas: `SaleService`, `InventoryService`, `TransferService`,
  `CashService`, `DiscountService`, `PurchaseService`, `ReturnService`, `ProductService`,
  `ImageService`, `UserService`, `BranchService`, `DashboardService`, `ReportService`, `Audit`.
- **Autorización en dos niveles:** el middleware `perm:` filtra la ruta y cada servicio valida la
  sucursal del registro (`Auth::authorizeBranch`) antes de leer o escribir.

## Modelo de datos (resumen)

| Dominio | Tablas |
|---|---|
| Seguridad | users, roles, permissions, role_permissions, user_roles, user_permissions, login_attempts |
| Sucursales | branches (almacén / tienda), branch_user_assignments, document_sequences |
| Catálogo | categories (1 nivel de subcategoría), brands, units_of_measure, unit_conversions, products, product_variants (presentaciones), product_images, product_price_history |
| Inventario | inventory (cantidad, reservado, en tránsito, mínimo), inventory_movements, inventory_counts(+items) |
| Transferencias | stock_transfers, stock_transfer_items |
| Compras | suppliers, purchase_orders(+items), goods_receipts(+items), supplier_returns(+items) |
| Ventas | sales, sale_items (fotografía histórica), sale_payments, discounts, discount_limits, discount_approvals |
| Caja | payment_methods, cash_registers, cash_sessions (un turno abierto por caja: índice único sobre columna generada), cash_movements, expenses |
| Devoluciones | returns, return_items |
| Clientes | customers, loyalty_programs, loyalty_ledger (inactivo) |
| Control | audit_logs, settings, migrations |

Tipos: dinero `DECIMAL(14,2)`, costos `DECIMAL(14,4)`, cantidades `DECIMAL(16,3)`. Nunca `FLOAT`.
En PHP la aritmética usa `App\Support\Dec` (enteros escalados, redondeo half-up).

## Unidades y venta fraccionada

- Cada producto tiene una **unidad base** (und, ml, L, g, kg) y forma de venta *por unidad* o
  *fraccionable* con precisión de 0 a 3 decimales (limitada por la unidad; las unidades discretas
  nunca aceptan decimales).
- El precio y el costo se expresan **por unidad base** (por ejemplo, $1.250 por ml).
- Las **presentaciones** (`product_variants`) consumen una cantidad fija de la base (decant 10 ml
  consume 10 ml) y tienen precio propio.
- Toda venta registra cantidad en la unidad de venta, cantidad consumida en la base, existencia
  anterior y posterior, precio de lista, descuento e importe final.

## Venta (SaleService::create)

1. Idempotencia: si `client_request_id` ya existe se devuelve la venta original.
2. Transacción: bloquea el turno de caja abierto del usuario en la sucursal de la sesión.
3. Recalcula cada línea desde el catálogo; valida precisión, límites de descuento efectivos
   (usuario/rol ∩ sucursal ∩ producto), precio mínimo y margen.
4. Si un descuento excede el límite exige una autorización **aprobada, vigente, del mismo cajero,
   sucursal y producto**, que se bloquea y se marca como usada.
5. Bloquea las filas de inventario en orden de producto y valida disponible = cantidad − reservado.
6. Valida pagos: los electrónicos no superan el total, el cambio sale del efectivo y la suma aplicada
   es exactamente el total. COP se liquida en pesos enteros (`money_decimals = 0`).
7. Inserta venta, líneas (snapshot), descuentos, pagos, movimientos de inventario y de caja, auditoría.

## Transferencias

`requested → approved (reserva en origen) → in_transit (sale del origen, queda "en tránsito" en
destino) → received | received_with_differences → resolved`. Cada transición bloquea la
transferencia y verifica su estado, de modo que un doble clic o dos usuarios simultáneos no
duplican movimientos. Las diferencias se resuelven como pérdida o retorno al origen.

## Caja

Efectivo esperado = suma de `cash_movements` con medio en efectivo (fondo + ventas netas de cambio
+ entradas − salidas − gastos − reembolsos − anulaciones). El cierre guarda esperado, contado,
diferencia, conteo por denominación y un resumen; un turno cerrado no admite movimientos y su
aprobación la hace un supervisor distinto del cajero.

## Fechas

Se guardan en UTC (`SET time_zone = '+00:00'`) y se muestran en `America/Bogota`. Los filtros por
día convierten el rango local a UTC (`utc_range()`), y las agrupaciones usan `CONVERT_TZ`.
