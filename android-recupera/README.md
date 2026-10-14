# Recupera Mensajes (Android)

App Android que **guarda los mensajes de WhatsApp a medida que llegan**, para
que sigas teniéndolos aunque luego los eliminen ("eliminar para todos"). Es la
misma técnica que usan apps como WAMR: lee las **notificaciones del propio
teléfono** y las archiva en una base de datos local.

## Qué hace y qué NO hace

- ✅ Guarda los mensajes que llegan **como notificación** después de instalarla.
- ✅ Marca los avisos de "mensaje eliminado" y conserva el texto original.
- ✅ Todo se queda en el teléfono (base de datos local Room). Nada se sube a ningún servidor.
- ❌ **No** recupera mensajes borrados *antes* de instalar la app.
- ❌ **No** accede a los chats ni a los servidores de WhatsApp (están cifrados de extremo a extremo).
- ❌ **No** funciona en iPhone (iOS no deja que una app lea notificaciones de otra).

### Límites técnicos (heredados del método)
- Solo captura lo que genera una notificación: si tienes el chat abierto, el chat silenciado o las notificaciones ocultas, no se guarda.
- De fotos, audios o vídeos normalmente solo llega el texto ("📷 Foto"), no el archivo.
- En grupos muy activos WhatsApp agrupa notificaciones y algún mensaje puede perderse.

## Uso responsable
Úsala **en tu propio teléfono**. Usarla para espiar el móvil de otra persona es
ilegal en la mayoría de los países.

## Cómo conseguir el APK (sin instalar nada en tu PC)

1. Sube estos archivos al repositorio (ya están en la rama de trabajo).
2. En GitHub, entra a la pestaña **Actions** → workflow **"Compilar APK Recupera Mensajes"**.
3. Si no arrancó solo, pulsa **Run workflow**.
4. Cuando termine (unos minutos), abre esa ejecución y descarga el artefacto **`recupera-mensajes-apk`**.
5. Dentro está `app-debug.apk`. Pásalo al teléfono.

## Instalar en el teléfono

1. Copia `app-debug.apk` al móvil (cable, Drive, Telegram, etc.).
2. Ábrelo. Android pedirá permiso para **"instalar apps de orígenes desconocidos"**: actívalo.
3. Instala y abre **Recupera Mensajes**.
4. La app pedirá **acceso a las notificaciones**: pulsa *Dar permiso* y actívalo en la lista.
5. Listo: a partir de ahí empezará a guardar los mensajes que lleguen.

> El APK es de *debug*, firmado con la clave de depuración de Android. Es
> perfectamente instalable; para publicarlo en Google Play habría que firmarlo
> con una clave de *release* propia.

## Compilar en local (opcional)

Con Android Studio: abre la carpeta `android-recupera/` y pulsa *Run*.
Por línea de comandos (requiere el SDK de Android y JDK 17):

```bash
cd android-recupera
gradle assembleDebug      # el APK queda en app/build/outputs/apk/debug/
```

## Estructura

```
android-recupera/
├─ app/src/main/
│  ├─ AndroidManifest.xml                 permisos y registro del servicio
│  └─ java/com/nametech/recupera/
│     ├─ MainActivity.kt                   interfaz (Jetpack Compose)
│     ├─ service/NotificationListener.kt   lee las notificaciones y las guarda
│     ├─ data/                             base de datos Room (Message, DAO, DB)
│     └─ ui/                               ViewModel y tema
└─ ...configuración de Gradle
```
