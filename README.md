# WEBPRO PLAYER

Reproductor IPTV nativo para **Android (teléfonos y tablets), Android TV y Google TV**, compatible con
servicios que exponen la **API Xtream Codes**. La aplicación **no incluye** servidores, listas, canales
ni credenciales: cada usuario introduce los datos de su propio proveedor.

- Kotlin · Jetpack Compose · Material 3
- AndroidX Media3 / ExoPlayer (HLS, MPEG-TS, MP4, MKV… sin WebView ni reproductores externos)
- Retrofit + OkHttp · Kotlin Coroutines · StateFlow · ViewModel
- Navigation Compose · DataStore · Android Keystore
- Arquitectura MVVM / Clean Architecture

---

## 1. Requisitos

| Herramienta | Versión |
|---|---|
| Android Studio | **Meerkat (2024.3.1) o superior** (recomendado: la última estable) |
| JDK | 17 o superior (el JDK embebido de Android Studio sirve) |
| Android SDK | Platform **35** (Android 15) instalado desde el SDK Manager |
| Gradle | 8.14.3 (se descarga solo mediante el *wrapper*) |
| Android Gradle Plugin | 8.9.1 |
| Kotlin | 2.1.20 |
| Dispositivo | Android 6.0 (API 23) o superior · Android TV / Google TV |

Versiones de librerías (ver `gradle/libs.versions.toml`): Compose BOM 2025.02.00, Media3 1.6.0,
Navigation 2.8.9, Lifecycle 2.8.7, DataStore 1.1.3, Retrofit 2.11.0, OkHttp 4.12.0,
kotlinx.serialization 1.8.0, Coroutines 1.10.1, Coil 2.7.0.

## 2. Cómo abrir el proyecto

1. Abre Android Studio → **File › Open** y selecciona la carpeta raíz del repositorio (la que contiene `settings.gradle.kts`).
2. Acepta la sincronización de Gradle. Si falta la plataforma 35, Android Studio ofrecerá instalarla.
3. Selecciona la configuración de ejecución **app** y un emulador/dispositivo (teléfono, tablet o Android TV).

## 3. Cómo compilar

Desde Android Studio: **Build › Make Project**. Desde terminal:

```bash
./gradlew assembleDebug          # APK de depuración
./gradlew testDebugUnitTest      # pruebas unitarias
./gradlew lint                   # informe de lint (app/build/reports)
```

En Windows usa `gradlew.bat` en lugar de `./gradlew`.

## 4. Generar APK

```bash
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk (o -unsigned)
```

O en Android Studio: **Build › Build App Bundle(s) / APK(s) › Build APK(s)**.

### Firma de release

Crea un keystore (una sola vez):

```bash
keytool -genkeypair -v -keystore webpro-release.jks -alias webpro -keyalg RSA -keysize 2048 -validity 10000
```

Y un archivo `keystore.properties` en la raíz del proyecto (está en `.gitignore`, **no lo subas al repositorio**):

```properties
storeFile=webpro-release.jks
storePassword=TU_PASSWORD
keyAlias=webpro
keyPassword=TU_PASSWORD
```

Si `keystore.properties` existe, `assembleRelease`/`bundleRelease` firman automáticamente; si no existe,
se genera un artefacto sin firmar. También puedes usar **Build › Generate Signed App Bundle / APK**.

## 5. Generar AAB (Google Play)

```bash
./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab
```

El build de release usa R8 (minificación + reducción de recursos) con las reglas de `app/proguard-rules.pro`.

## 6. Arquitectura

```
UI (Compose)  →  ViewModel (StateFlow)  →  Repository / UseCase  →  XtreamService (Retrofit)  →  API
                                       ↘  DataStore + Keystore (sesión, favoritos, historial, ajustes)
Player UI     →  PlayerViewModel  →  PlayerManager (único ExoPlayer de la app)
```

```
app/src/main/java/com/webpro/player/
├── WebProApp.kt / MainActivity.kt
├── di/            AppContainer: dependencias únicas del proceso (sin reflexión)
├── data/
│   ├── api/       XtreamService (Retrofit), XtreamApiFactory, HttpClientFactory, JsonResponseReader (streaming)
│   ├── model/     JsonExt + XtreamParsers: JSON tolerante → modelos de dominio
│   └── repository/ XtreamRepositoryImpl (caché en memoria), Session/Favorites/History/Settings
├── domain/
│   ├── model/     Category, LiveChannel, Movie, Series, Episode, AccountInfo, AppError, DataResult…
│   ├── repository/ interfaces
│   └── usecase/   LoginUseCase, SearchContentUseCase, StreamUrlBuilder
├── player/        PlayerManager, PlayerViewModel, PlayerState, PlayerError, PlayerErrorClassifier,
│   │              RetryPolicy, MediaItemFactory, PlaybackRequest
│   └── ui/        PlayerScreen, PlayerControls, ChannelPanel, overlays
├── navigation/    Routes, AppNavHost, navegación segura (anti doble clic)
├── storage/       DataStores, SecureCipher (AES-256/GCM en Android Keystore)
├── ui/            theme, components, adaptive (DeviceProfile), common (UiState, CatalogViewModel)
│                  splash, login, main, home, live, movies, series, favorites, search, settings
└── utils/         UrlNormalizer, TextNormalizer, TimeFormat, NetworkMonitor, SafeLog/LogRedactor
```

- Ningún Composable hace llamadas HTTP: todo pasa por ViewModel → Repository → XtreamService.
- Cada pantalla expone `UiState` con **Loading / Success / Empty / Error** (con botón *Reintentar*).
- Las secciones de catálogo comparten `CatalogViewModel` (filtrado por categoría y texto en
  `Dispatchers.Default`, con *debounce*).

## 7. Configuración y seguridad

- **Login**: DNS/URL, usuario, contraseña y “Recordar conexión”. La URL se normaliza
  (`servidor.com:8080` → `http://servidor.com:8080`, `http:/x` → `http://x`, barras finales, `player_api.php`
  o un enlace M3U completo pegado, del que también se extraen usuario y contraseña). Las URL válidas no se alteran.
- La contraseña se cifra con **AES-256/GCM** usando una clave del **Android Keystore** y se guarda en DataStore
  solo si se marca “Recordar conexión”; si no, la sesión vive únicamente en memoria.
- Las contraseñas nunca se escriben en logs: no hay *logging interceptor* y `SafeLog` redacta `username=`,
  `password=` y las rutas `/live|movie|series/usuario/clave/`.
- Copias de seguridad desactivadas (`allowBackup=false` + `data_extraction_rules.xml`).
- Se permite tráfico HTTP (`network_security_config.xml`) porque la mayoría de servidores IPTV no usan HTTPS;
  los servidores HTTPS mantienen validación completa de certificados.
- **Configuración** muestra servidor, usuario (la contraseña siempre enmascarada), estado, vencimiento y
  conexiones; permite elegir formato de TV en vivo (Auto/HLS/TS), reproducción automática del siguiente
  episodio, **Cerrar sesión** (conserva favoritos) y **Eliminar configuración** (borra todo).

## 8. Funcionamiento Xtream Codes

Todas las peticiones van a `{servidor}/player_api.php?username=…&password=…`:

| Acción | Uso |
|---|---|
| *(sin action)* | autenticación: `user_info` (auth, status, exp_date, max_connections, allowed_output_formats) |
| `get_live_categories` / `get_live_streams` | categorías y canales |
| `get_vod_categories` / `get_vod_streams` / `get_vod_info&vod_id=` | películas y ficha |
| `get_series_categories` / `get_series` / `get_series_info&series_id=` | series, temporadas y episodios |

URLs de reproducción:

- TV en vivo: `{servidor}/live/{usuario}/{clave}/{id}.m3u8` o `.ts`
- Películas: `{servidor}/movie/{usuario}/{clave}/{id}.{container_extension}`
- Episodios: `{servidor}/series/{usuario}/{clave}/{id}.{container_extension}`

**Tolerancia**: los parsers aceptan números como texto (y viceversa), `null`, cadenas vacías, `info: []`,
listas como objeto (`{"0":{…}}`), episodios como mapa por temporada o como arrays, años en el nombre,
`rating` o `rating_5based`, BOM UTF-8 y respuestas HTML (servidor no Xtream). Las entradas sin ID se descartan
y los duplicados se eliminan. Los listados grandes se leen en *streaming* elemento a elemento (no se carga el
JSON completo en memoria) y se guardan en **caché en memoria** (4 h, por servidor+usuario); varias pantallas
que piden la misma lista comparten una única descarga. Cambiar de canal nunca vuelve a descargar la lista.

## 9. Reproductor

Un único sistema centralizado (`player/`):

- **PlayerManager** es el único dueño de un `ExoPlayer` en toda la app (TV en vivo, películas y series).
  Lo crea bajo demanda, le añade **un solo listener** y lo libera explícitamente (`release`), por lo que no hay
  instancias simultáneas, listeners duplicados ni fugas.
- **Propiedad**: cada pantalla de reproducción tiene un `ownerId`; solo ese dueño puede pausar en `onStop` o
  liberar en `onCleared`. Así, una pantalla que se cierra nunca detiene lo que inició la siguiente.
- **Eventos obsoletos**: cada carga usa un `mediaId` con contador de generación; los callbacks de un contenido
  anterior se ignoran (cambios rápidos de canal, doble clic).
- **Zapping con debounce** (450 ms): pulsar CH+/CH− varias veces muestra el canal al instante y solo reproduce el
  último. Volver a pulsar el canal actual no reinicia la reproducción.
- **MediaItem** con MIME explícito (`application/x-mpegURL`, `video/mp2t`, `video/mp4`, `video/x-matroska`…),
  HLS mediante `media3-exoplayer-hls`, TS con detección de keyframes no-IDR, `OkHttpDataSource`, búfer ajustado
  para IPTV, *decoder fallback* y foco de audio.
- **Formatos alternativos**: si un canal falla en HLS (404, fuente o decodificador) se prueba automáticamente TS.
- **Ciclo de vida**: en `ON_STOP` se guarda la posición y se libera el decodificador; en `ON_START` se reanuda
  (directo: en el borde en vivo; VOD: en la misma posición). La rotación no recrea la Activity
  (`configChanges`) y el ViewModel conserva el estado. Al salir con BACK se guarda el progreso y se libera todo.
- **Continuar viendo**: posición guardada cada 10 s y al salir; las fichas muestran “Continuar (mm:ss)” y el
  Inicio muestra una fila *Continuar viendo*. Al terminar un episodio se reproduce el siguiente (configurable).
- **Controles**: pantalla completa inmersiva, play/pausa, ±10 s, barra de progreso, volumen (subir, bajar,
  silenciar), modo de imagen (ajustar/zoom/estirar), lista de canales, episodio anterior/siguiente y bloqueo de
  rotación en móviles. Se ocultan solos a los 4,5 s.

### Manejo de errores (`PlayerError` + `PlayerErrorClassifier`)

| Error | Tratamiento |
|---|---|
| Timeout, connection reset, error de red, 5xx, desconocido | reintentos limitados con backoff **500 ms → 1 s → 2 s → 4 s**; después, mensaje |
| Behind live window | vuelve al borde en directo y reintenta |
| HTTP 401 / 403 | **no se reintenta**; mensaje claro (credenciales / límite de conexiones) |
| HTTP 404, error de fuente o decodificador | prueba el formato alternativo; si no hay, mensaje |
| Sin Internet | muestra el error y **reanuda automáticamente** cuando vuelve la conexión |

No existen bucles infinitos: el contador solo se reinicia tras 15 s de reproducción estable. El usuario nunca ve
trazas técnicas, solo mensajes comprensibles con botones *Reintentar* / *Volver* / *Lista de canales*.

## 10. Soporte Android TV / Google TV

- Aparece en el launcher de TV (`LEANBACK_LAUNCHER`, banner propio) y no requiere pantalla táctil.
- Navegación completa con **DPAD_UP/DOWN/LEFT/RIGHT, DPAD_CENTER y BACK**: todos los elementos son enfocables,
  con escala y borde al recibir el foco; foco inicial automático en Inicio, fichas, errores y reproductor.
- Interfaz adaptativa con `WindowSizeClass` + detección de TV (`DeviceProfile`): barra inferior en teléfonos,
  *navigation rail* lateral en tablets y TV, categorías en columna lateral en pantallas grandes, columnas y
  tamaños de tarjetas adaptados.
- En el reproductor (controles ocultos): **OK** muestra los controles; **Arriba/Abajo** o **CH+/CH−** cambian de
  canal; **Izquierda** abre la lista de canales (en directo) o retrocede 10 s (VOD); **Derecha** avanza 10 s;
  teclas multimedia (play/pausa, avance, retroceso, siguiente/anterior). **BACK** cierra la lista, luego oculta
  los controles y finalmente sale del reproductor.

## 11. Pruebas

`app/src/test` contiene pruebas unitarias JVM de las partes críticas:

- `UrlNormalizerTest` – normalización de URL, esquemas mal escritos, puertos, enlaces M3U.
- `XtreamParsersTest` – respuestas incompletas, tipos mezclados, `info: []`, episodios en mapa/array.
- `XtreamRepositoryImplTest` – MockWebServer: autenticación, errores HTTP, HTML, caché, descargas concurrentes.
- `StreamUrlBuilderTest` – URLs de live/VOD/series, formatos permitidos, codificación de credenciales.
- `RetryAndErrorTest` – backoff limitado y clasificación de errores (401/403/404/5xx/timeout/reset/decoder).
- `UseCasesTest` – validación de login y búsqueda global (acentos, prioridad, fallos parciales).

```bash
./gradlew testDebugUnitTest
```

## 12. Aviso

WEBPRO PLAYER es únicamente un reproductor. No proporciona contenido. El usuario es responsable de disponer de
un servicio IPTV legítimo y de los derechos sobre el contenido que reproduce.
