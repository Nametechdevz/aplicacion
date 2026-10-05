package com.webpro.player.player

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import com.webpro.player.domain.usecase.StreamSource

/** Builds Media3 [MediaItem]s with an explicit MIME type when the container is known. */
object MediaItemFactory {

    fun create(
        request: PlaybackRequest,
        source: StreamSource,
        mediaId: String,
        liveTargetOffsetMs: Long? = null
    ): MediaItem {
        val builder = MediaItem.Builder()
            .setUri(source.url)
            .setMediaId(mediaId)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(request.title)
                    .setSubtitle(request.subtitle)
                    .build()
            )
        mimeTypeFor(source.extension)?.let(builder::setMimeType)
        if (request.isLive) {
            builder.setLiveConfiguration(
                MediaItem.LiveConfiguration.Builder()
                    .setMaxPlaybackSpeed(1.02f)
                    .apply { if (liveTargetOffsetMs != null) setTargetOffsetMs(liveTargetOffsetMs) }
                    .build()
            )
        }
        return builder.build()
    }

    /** Null lets Media3 sniff the container (safer for uncommon extensions). */
    fun mimeTypeFor(extension: String?): String? = when (extension?.lowercase()) {
        "m3u8" -> MimeTypes.APPLICATION_M3U8
        "ts" -> MimeTypes.VIDEO_MP2T
        "mp4", "m4v" -> MimeTypes.VIDEO_MP4
        "mkv" -> MimeTypes.VIDEO_MATROSKA
        "webm" -> MimeTypes.VIDEO_WEBM
        else -> null
    }
}
