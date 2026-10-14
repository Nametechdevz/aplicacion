package com.nametech.recupera.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Environment
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.nametech.recupera.R
import com.nametech.recupera.data.AppDatabase
import com.nametech.recupera.data.MediaItem
import com.nametech.recupera.data.MediaType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * Servicio en primer plano que vigila las carpetas de WhatsApp y copia la
 * multimedia (fotos, vídeos, audios, documentos) a un lugar a salvo en cuanto
 * aparece. Así, aunque WhatsApp borre el archivo tras "eliminar para todos",
 * la copia se conserva.
 *
 * Requiere el permiso "Acceso a todos los archivos" para poder leer la carpeta
 * de WhatsApp en Android 11+.
 */
class MediaBackupService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (!scanning) {
            scanning = true
            scope.launch { watchLoop() }
        }
        return START_STICKY
    }

    private suspend fun watchLoop() {
        val dao = AppDatabase.get(applicationContext).mediaDao()
        val destRoot = File(getExternalFilesDir(null), "Recuperados").apply { mkdirs() }

        while (scope.isActive) {
            runCatching { scanOnce(dao, destRoot) }
            delay(SCAN_INTERVAL_MS)
        }
    }

    /** Recorre las carpetas de WhatsApp y copia lo que todavía no esté guardado. */
    private suspend fun scanOnce(
        dao: com.nametech.recupera.data.MediaDao,
        destRoot: File
    ) {
        val external = Environment.getExternalStorageDirectory() ?: return
        val known = dao.existingKeys().toHashSet()

        for (relRoot in WHATSAPP_MEDIA_ROOTS) {
            val root = File(external, relRoot)
            if (!root.isDirectory) continue

            root.walkTopDown()
                .filter { it.isFile }
                .filter { it.name != ".nomedia" && !it.name.endsWith(".tmp") }
                .filter { !it.absolutePath.startsWith(destRoot.absolutePath) }
                .forEach { file ->
                    val size = file.length()
                    if (size <= 0L) return@forEach
                    val key = "${file.absolutePath}|$size"
                    if (key in known) return@forEach

                    val type = classify(file)
                    val saved = copyToSafe(file, destRoot, type) ?: return@forEach
                    dao.insert(
                        MediaItem(
                            sourcePath = file.absolutePath,
                            savedPath = saved.absolutePath,
                            fileName = file.name,
                            type = type,
                            size = size,
                            sourceModified = file.lastModified()
                        )
                    )
                    known.add(key)
                }
        }
    }

    private fun copyToSafe(src: File, destRoot: File, type: MediaType): File? = runCatching {
        val dir = File(destRoot, type.name.lowercase()).apply { mkdirs() }
        var dest = File(dir, src.name)
        var i = 1
        while (dest.exists() && dest.length() != src.length()) {
            val dot = src.name.lastIndexOf('.')
            dest = if (dot > 0)
                File(dir, "${src.name.substring(0, dot)}_$i${src.name.substring(dot)}")
            else File(dir, "${src.name}_$i")
            i++
        }
        if (!dest.exists()) {
            src.inputStream().use { input ->
                dest.outputStream().use { output -> input.copyTo(output) }
            }
            dest.setLastModified(src.lastModified())
        }
        dest
    }.getOrNull()

    private fun classify(file: File): MediaType {
        val ext = file.extension.lowercase()
        val parent = (file.parentFile?.name ?: "").lowercase()
        return when {
            ext in IMAGE_EXT || "image" in parent || "stickers" in parent -> MediaType.IMAGE
            ext in VIDEO_EXT || "video" in parent || "gif" in parent -> MediaType.VIDEO
            ext in AUDIO_EXT || "audio" in parent || "voice" in parent || "ptt" in parent -> MediaType.AUDIO
            ext in DOC_EXT || "document" in parent -> MediaType.DOCUMENT
            else -> MediaType.OTHER
        }
    }

    private fun startInForeground() {
        val channelId = "media_backup"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                channelId,
                "Copia de multimedia",
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(ch)
        }
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Recupera Mensajes")
            .setContentText("Protegiendo la multimedia de WhatsApp")
            .setSmallIcon(R.drawable.ic_launcher)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    override fun onDestroy() {
        scanning = false
        scope.coroutineContext[kotlinx.coroutines.Job]?.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIF_ID = 1001
        private const val SCAN_INTERVAL_MS = 10_000L

        @Volatile
        private var scanning = false

        fun start(context: Context) {
            val intent = Intent(context, MediaBackupService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        // Carpetas de WhatsApp (relativas a /storage/emulated/0).
        private val WHATSAPP_MEDIA_ROOTS = listOf(
            "Android/media/com.whatsapp/WhatsApp/Media",
            "Android/media/com.whatsapp.w4b/WhatsApp Business/Media",
            "WhatsApp/Media",                 // instalaciones antiguas (Android 10 o anterior)
            "WhatsApp Business/Media"
        )

        private val IMAGE_EXT = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif")
        private val VIDEO_EXT = setOf("mp4", "3gp", "mkv", "mov", "avi", "webm")
        private val AUDIO_EXT = setOf("opus", "mp3", "m4a", "aac", "ogg", "wav", "amr")
        private val DOC_EXT = setOf("pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip", "apk")
    }
}
