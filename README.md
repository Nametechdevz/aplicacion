# Mi Camión — contabilidad del camión

App Expo / React Native (SDK 58, Expo Router, expo-sqlite) para llevar viajes, gastos y cortes semanales de un camión. Todo se guarda en el celular (SQLite), funciona sin internet.

## Correr y compilar (Windows)

```bash
npm install
npx expo start            # probar en Expo Go (expo-sqlite viene incluido)
npx expo run:android      # build local
npx eas-cli@latest build -p android --profile preview   # APK en la nube
```

`npx tsc --noEmit` debe pasar sin errores.

## Cómo funciona

- **Viajes**: fecha, origen → destino, cliente, carga, valor del flete, % del conductor (se copia de Ajustes y queda guardado en cada viaje), km de salida y llegada.
- **Gastos**: ACPM (con galones → km/galón), peajes, policía/retenes, llantería, taller, repuestos, lavado, parqueadero, comida, cargue, SOAT/técnico, otros. Cada gasto puede ir ligado a un viaje o ser general, y marca si lo pagó el dueño o el conductor.
- **Plata entregada al conductor**: categoría especial; no es gasto del camión, se descuenta en el arreglo.
- **Semana**: resumen de lunes a domingo con navegación entre semanas.
- **Cortes**: cierran un rango de fechas y bloquean esos movimientos. Se pueden compartir por WhatsApp o reabrir.

### Fórmulas

```
Conductor  = Σ (flete × % del viaje)          ← sobre el flete bruto
Utilidad   = Fletes − Gastos del camión − Conductor
Arreglo    = Conductor + gastos que pagó él − plata que se le entregó
             (positivo: se le paga · negativo: él devuelve)
```

### Qué entra en un corte

Solo movimientos sin corte: los viajes del rango con **todos** sus gastos (aunque tengan otra fecha), más los gastos sueltos del rango. Un gasto de un viaje pendiente fuera del rango espera al corte de ese viaje.

## Estructura

```
src/app/(tabs)/   index (semana) · viajes · gastos · cortes · ajustes
src/app/viaje/    form (crear/editar) · [id] (detalle)
src/app/gasto/    form
src/app/corte/    nuevo · [id]
src/lib/db.ts     esquema, migraciones (PRAGMA user_version), consultas, cálculos
src/lib/categorias.ts · format.ts
src/components/   ui.tsx · items.tsx
```

Para agregar campos, crea una migración nueva en `migrar()` (`if (version === 1) {...}`) y sube `VERSION_DB`.
