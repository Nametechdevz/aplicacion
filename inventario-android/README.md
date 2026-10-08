# Inventario Pro (Android)

App Android para gestionar el inventario y las ventas de un negocio que vende **cuentas de
streaming, IPTV, cursos, sistemas web, aplicaciones, licencias, juegos** y cualquier otro producto
digital. Funciona sin internet: los datos viven en el teléfono (SQLite/Room).

## Funciones

**Inventario**
- Categorías: Streaming, IPTV/TV, Curso, Sistema web, Aplicación, Licencia/Software, Juegos, Otro
  (con sugerencias rápidas: Netflix, Disney+, Max, Spotify, Canva Pro, Office 365…).
- Datos de cada producto: usuario/correo, contraseña (oculta), perfil/PIN, link de acceso,
  información adicional, proveedor, costo, precio de venta, **fecha de compra** y **fecha de vencimiento**.
- Crear varias unidades a la vez (p. ej. los 5 perfiles de una cuenta, numerados solos) y duplicar.
- Filtros: **Todas, Disponibles, Vendidas, Por vencer, Vencidas, Por cobrar, Inactivas**, por
  categoría, búsqueda y orden (vencimiento, recientes, nombre, precio).
- Copiar datos, compartir, abrir el link, dar de baja, reactivar, eliminar.

**Ventas y clientes**
- Vender a un cliente existente o nuevo (nombre + **WhatsApp**), fecha de venta, duración rápida
  (1, 2, 3, 6 meses, 1 año o sin vencimiento), precio, pagado / por cobrar.
- Al vender, se envían los datos de acceso al cliente por **WhatsApp** con un toque.
- Renovar (extiende el vencimiento del cliente y/o de la cuenta del proveedor y registra el cobro),
  editar venta, liberar el producto (vuelve a disponible).
- Ficha del cliente: servicios activos, total comprado, deuda, historial, botones de WhatsApp y llamada.

**Recordatorios**
- Pestaña *Avisos*: por vencer, vencidos, por cobrar y cuentas del proveedor por renovar.
- **Enviar recordatorio** por WhatsApp (elige solo la plantilla de "por vencer" o "vencido") y
  queda marcado cuándo se recordó.
- Notificación diaria a la hora que elija con el resumen de vencimientos.
- Plantillas de mensajes editables con variables: `{cliente} {servicio} {plan} {usuario} {clave}
  {perfil} {link} {vence} {dias} {precio} {negocio}` (las líneas con datos vacíos se omiten).
- WhatsApp normal o **WhatsApp Business**; el indicativo de país se agrega solo (por defecto +57).

**Panel y reportes**
- Tarjetas de disponibles, vendidas, por vencer, vencidas y por cobrar (tocar abre la lista filtrada).
- Finanzas del mes: ventas, renovaciones, ingresos y ganancia; totales históricos; inventario por categoría.

**Datos y seguridad**
- Respaldo completo en JSON (guárdelo en Drive, correo, etc.) y restauración.
- Exportar inventario y ventas a CSV (abre directo en Excel / Google Sheets).
- Bloqueo con PIN (se pide al abrir y tras 2 minutos en segundo plano).

## Descargar el APK

GitHub Actions compila el APK en cada cambio dentro de `inventario-android/`
(workflow **Android - Inventario Pro**):

- Pestaña *Actions* → última ejecución → artefacto **InventarioPro-APK**, o
- *Actions* → *Android - Inventario Pro* → *Run workflow* con **Publicar release** marcado: crea la
  release `inventario-v<versión>` con el APK adjunto.

En el teléfono, abra el APK y permita "Instalar apps desconocidas" si Android lo solicita.

## Compilar localmente

Requisitos: Android Studio (o JDK 17 + Android SDK 35).

```bash
cd inventario-android
./gradlew testDebugUnitTest   # pruebas
./gradlew assembleRelease     # APK en app/build/outputs/apk/release/
```

### Firma
El APK de release se firma con `keystore/inventario-release.jks` (incluida para que cada APK nuevo
se instale como **actualización** sin perder datos). Para usar su propia llave defina
`INVENTARIO_KEYSTORE`, `INVENTARIO_STORE_PASSWORD`, `INVENTARIO_KEY_ALIAS` e
`INVENTARIO_KEY_PASSWORD`. Si cambia la llave, hay que desinstalar la versión anterior
(haga un respaldo antes).

## Estructura

```
app/src/main/java/com/nametech/inventario/
├── data/        Room (Item, Client, Sale), repositorio, ajustes, respaldos/CSV
├── domain/      Categorías, estados (por vencer / vencida), filtros
├── util/        Formatos, plantillas de mensajes, WhatsApp
├── work/        Notificación diaria (WorkManager)
└── ui/          Jetpack Compose (Material 3): panel, inventario, detalle, venta,
                 clientes, avisos, ajustes y bloqueo
```

Stack: Kotlin 2.0, Jetpack Compose + Material 3, Navigation Compose, Room, WorkManager.
minSdk 26 (Android 8.0), targetSdk 35.
