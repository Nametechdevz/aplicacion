package com.webpro.player.domain.usecase

import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.LiveStreamFormat
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** A playable URL plus the container extension used to pick the MIME type. */
data class StreamSource(val url: String, val extension: String) {
    override fun toString(): String = "StreamSource(extension=$extension)" // URL contains credentials
}

/**
 * Builds Xtream Codes stream URLs:
 * - live:    {base}/live/{user}/{pass}/{id}.{m3u8|ts}
 * - movie:   {base}/movie/{user}/{pass}/{id}.{ext}
 * - episode: {base}/series/{user}/{pass}/{id}.{ext}
 */
class StreamUrlBuilder {

    /**
     * Returns the live URL candidates ordered by preference. The player falls back
     * to the next candidate when a format is rejected by the server.
     */
    fun live(
        credentials: Credentials,
        streamId: Long,
        format: LiveStreamFormat,
        allowedFormats: List<String>
    ): List<StreamSource> {
        val allowed = allowedFormats.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        val preferred = when (format) {
            LiveStreamFormat.HLS -> listOf(HLS, TS)
            LiveStreamFormat.TS -> listOf(TS, HLS)
            LiveStreamFormat.AUTO -> if (allowed.isEmpty() || HLS in allowed) listOf(HLS, TS) else listOf(TS, HLS)
        }
        val usable = if (allowed.isEmpty()) preferred else preferred.filter { it in allowed }.ifEmpty { listOf(TS) }
        return usable.mapNotNull { ext -> build(credentials, "live", "$streamId.$ext")?.let { StreamSource(it, ext) } }
    }

    fun movie(credentials: Credentials, streamId: Long, extension: String?): StreamSource? {
        val ext = sanitizeExtension(extension)
        return build(credentials, "movie", "$streamId.$ext")?.let { StreamSource(it, ext) }
    }

    fun episode(credentials: Credentials, episodeId: Long, extension: String?): StreamSource? {
        val ext = sanitizeExtension(extension)
        return build(credentials, "series", "$episodeId.$ext")?.let { StreamSource(it, ext) }
    }

    private fun build(credentials: Credentials, kind: String, file: String): String? {
        val base: HttpUrl = credentials.serverUrl.toHttpUrlOrNull() ?: return null
        return base.newBuilder()
            .addPathSegment(kind)
            .addPathSegment(credentials.username)
            .addPathSegment(credentials.password)
            .addPathSegment(file)
            .build()
            .toString()
    }

    companion object {
        const val HLS = "m3u8"
        const val TS = "ts"
        private const val DEFAULT_VOD_EXTENSION = "mp4"
        private val validExtension = Regex("^[a-z0-9]{1,5}$")

        fun sanitizeExtension(extension: String?): String {
            val ext = extension?.trim()?.trimStart('.')?.lowercase().orEmpty()
            return if (validExtension.matches(ext)) ext else DEFAULT_VOD_EXTENSION
        }
    }
}
