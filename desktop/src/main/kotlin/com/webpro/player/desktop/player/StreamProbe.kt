package com.webpro.player.desktop.player

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit

/** Result of asking the server directly why a stream failed (libVLC does not expose HTTP codes). */
sealed class ProbeResult {
    data class Http(val code: Int) : ProbeResult()
    data object Timeout : ProbeResult()
    data object Unreachable : ProbeResult()
}

class StreamProbe(baseClient: OkHttpClient) {
    private val client = baseClient.newBuilder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .callTimeout(10, TimeUnit.SECONDS)
        .build()

    /** Requests the first bytes of [url] and returns the HTTP status (body is discarded). */
    suspend fun probe(url: String): ProbeResult = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(url)
                .header("Range", "bytes=0-1023")
                .header("User-Agent", VlcOptions.USER_AGENT)
                .build()
            client.newCall(request).execute().use { ProbeResult.Http(it.code) }
        } catch (e: SocketTimeoutException) {
            ProbeResult.Timeout
        } catch (e: IOException) {
            ProbeResult.Unreachable
        } catch (e: IllegalArgumentException) {
            ProbeResult.Unreachable
        }
    }
}
