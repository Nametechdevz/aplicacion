package com.webpro.player.player

import androidx.lifecycle.SavedStateHandle
import com.webpro.player.domain.model.ContentType

/** Navigation arguments of the player screen. */
data class PlayerArgs(
    val type: ContentType,
    val id: Long,
    val title: String,
    val extension: String?,
    val seriesId: Long?,
    val categoryId: String?,
    val resume: Boolean
) {
    companion object {
        const val TYPE = "type"
        const val ID = "id"
        const val TITLE = "title"
        const val EXT = "ext"
        const val SERIES_ID = "seriesId"
        const val CATEGORY_ID = "categoryId"
        const val RESUME = "resume"

        fun from(handle: SavedStateHandle): PlayerArgs = PlayerArgs(
            type = ContentType.fromName(handle.get<String>(TYPE)) ?: ContentType.LIVE,
            id = handle.get<Long>(ID) ?: -1L,
            title = handle.get<String>(TITLE).orEmpty(),
            extension = handle.get<String>(EXT)?.takeIf { it.isNotBlank() },
            seriesId = handle.get<Long>(SERIES_ID)?.takeIf { it > 0 },
            categoryId = handle.get<String>(CATEGORY_ID)?.takeIf { it.isNotBlank() },
            resume = handle.get<Boolean>(RESUME) ?: true
        )
    }
}
