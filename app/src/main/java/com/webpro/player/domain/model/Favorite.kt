package com.webpro.player.domain.model

import kotlinx.serialization.Serializable

/**
 * A locally stored favorite. It carries a snapshot of the data needed to show it
 * and to start playback so the favorites screen works without server requests.
 */
@Serializable
data class FavoriteItem(
    val type: ContentType,
    val id: Long,
    val name: String,
    val imageUrl: String? = null,
    val categoryId: String? = null,
    val containerExtension: String? = null,
    val addedAt: Long = 0L
) {
    val key: String get() = keyOf(type, id)

    companion object {
        fun keyOf(type: ContentType, id: Long): String = "${type.name}:$id"
    }
}
