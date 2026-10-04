package com.webpro.player.domain.model

import kotlinx.serialization.Serializable

/** Saved playback progress used by "continue watching". */
@Serializable
data class ResumePoint(
    val type: ContentType,
    val id: Long,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAt: Long,
    val seriesId: Long? = null,
    val season: Int? = null,
    val episodeNumber: Int? = null,
    val title: String? = null,
    val imageUrl: String? = null
) {
    val key: String get() = keyOf(type, id)

    val progress: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f

    companion object {
        fun keyOf(type: ContentType, id: Long): String = "${type.name}:$id"
    }
}
