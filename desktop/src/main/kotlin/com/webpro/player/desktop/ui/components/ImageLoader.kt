package com.webpro.player.desktop.ui.components

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jetbrains.skia.Image
import org.jetbrains.skia.Rect
import org.jetbrains.skia.FilterMipmap
import org.jetbrains.skia.FilterMode
import org.jetbrains.skia.MipmapMode
import org.jetbrains.skia.Surface
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Loads logos and posters with a memory LRU + disk cache, limited parallelism,
 * request de-duplication and downscaling (posters never use more memory than needed).
 */
class ImageLoader(baseClient: OkHttpClient, private val cacheDir: File) {

    private val client = baseClient.newBuilder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
    private val permits = Semaphore(MAX_PARALLEL)
    private val inFlight = ConcurrentHashMap<String, CompletableDeferred<ImageBitmap?>>()
    private val failed = ConcurrentHashMap.newKeySet<String>()
    private val memory = object : LinkedHashMap<String, ImageBitmap>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ImageBitmap>?) = size > MEMORY_ITEMS
    }

    init {
        Thread({ trimDiskCache() }, "image-cache-trim").apply { isDaemon = true }.start()
    }

    fun cached(url: String, maxSize: Int): ImageBitmap? = synchronized(memory) { memory[key(url, maxSize)] }

    suspend fun load(url: String, maxSize: Int): ImageBitmap? {
        val key = key(url, maxSize)
        synchronized(memory) { memory[key] }?.let { return it }
        if (key in failed) return null
        val mine = CompletableDeferred<ImageBitmap?>()
        val existing = inFlight.putIfAbsent(key, mine)
        if (existing != null) return existing.await()
        val result = runCatching { permits.withPermit { withContext(Dispatchers.IO) { fetch(url, maxSize) } } }.getOrNull()
        if (result != null) synchronized(memory) { memory[key] = result } else failed += key
        inFlight.remove(key)
        mine.complete(result)
        return result
    }

    private fun fetch(url: String, maxSize: Int): ImageBitmap? {
        val file = File(cacheDir, sha1(url))
        val bytes = if (file.isFile && file.length() > 0) {
            file.setLastModified(System.currentTimeMillis())
            file.readBytes()
        } else {
            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                response.body?.bytes()
            }?.also { data -> runCatching { file.writeBytes(data) } }
        } ?: return null
        val image = runCatching { Image.makeFromEncoded(bytes) }.getOrNull() ?: return null
        return downscale(image, maxSize).toComposeImageBitmap()
    }

    private fun downscale(image: Image, maxSize: Int): Image {
        val largest = maxOf(image.width, image.height)
        if (largest <= maxSize) return image
        val scale = maxSize.toFloat() / largest
        val w = (image.width * scale).toInt().coerceAtLeast(1)
        val h = (image.height * scale).toInt().coerceAtLeast(1)
        val surface = Surface.makeRasterN32Premul(w, h)
        surface.canvas.drawImageRect(
            image,
            Rect.makeWH(image.width.toFloat(), image.height.toFloat()),
            Rect.makeWH(w.toFloat(), h.toFloat()),
            FilterMipmap(FilterMode.LINEAR, MipmapMode.NONE),
            null,
            true
        )
        val scaled = surface.makeImageSnapshot()
        image.close()
        surface.close()
        return scaled
    }

    private fun trimDiskCache() {
        runCatching {
            val files = cacheDir.listFiles()?.filter { it.isFile } ?: return
            var total = files.sumOf { it.length() }
            if (total <= MAX_DISK_BYTES) return
            for (file in files.sortedBy { it.lastModified() }) {
                total -= file.length()
                file.delete()
                if (total <= MAX_DISK_BYTES * 0.8) break
            }
        }
    }

    private fun key(url: String, maxSize: Int) = "$maxSize|$url"

    private fun sha1(text: String): String =
        MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

    private companion object {
        const val MAX_PARALLEL = 6
        const val MEMORY_ITEMS = 400
        const val MAX_DISK_BYTES = 300L * 1024 * 1024
    }
}
