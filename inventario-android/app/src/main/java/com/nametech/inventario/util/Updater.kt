package com.nametech.inventario.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Actualización dentro de la app: descarga el APK publicado en el servidor y abre el instalador
 * de Android. Como el APK está firmado con la misma llave, se instala encima y se conservan
 * todos los datos.
 */
object Updater {

    suspend fun download(context: Context, url: String, onProgress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "actualizaciones").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "InventarioPro.apk")
        val conn = open(url)
        val total = conn.contentLengthLong
        conn.inputStream.use { input ->
            file.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                var read: Int
                var done = 0L
                while (input.read(buf).also { read = it } >= 0) {
                    out.write(buf, 0, read)
                    done += read
                    if (total > 0) withContext(Dispatchers.Main) { onProgress(done.toFloat() / total) }
                }
            }
        }
        conn.disconnect()
        if (file.length() < 100_000) throw IllegalStateException("el archivo descargado no es un APK válido")
        file
    }

    /** Abre la conexión siguiendo redirecciones (también de http a https). */
    private fun open(url: String): HttpURLConnection {
        var current = url
        repeat(6) {
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = true
            conn.connectTimeout = 15_000
            conn.readTimeout = 60_000
            val code = conn.responseCode
            if (code in 300..399) {
                current = URL(URL(current), conn.getHeaderField("Location")).toString()
                conn.disconnect()
            } else if (code == 200) {
                return conn
            } else {
                conn.disconnect()
                throw IllegalStateException("el servidor respondió $code")
            }
        }
        throw IllegalStateException("demasiadas redirecciones")
    }

    fun install(context: Context, file: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    fun openInBrowser(context: Context, url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
