package com.webpro.player.player

import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.usecase.StreamSource

/**
 * Everything the [PlayerManager] needs to play one item. [sources] are ordered by
 * preference; the manager falls back to the next one when a format is rejected.
 */
data class PlaybackRequest(
    val type: ContentType,
    val contentId: Long,
    val title: String,
    val subtitle: String? = null,
    val artworkUrl: String? = null,
    val sources: List<StreamSource>,
    val startPositionMs: Long = 0L
) {
    val contentKey: String get() = "${type.name}:$contentId"
    val isLive: Boolean get() = type == ContentType.LIVE

    override fun toString(): String = "PlaybackRequest(key=$contentKey, sources=${sources.size})"
}
