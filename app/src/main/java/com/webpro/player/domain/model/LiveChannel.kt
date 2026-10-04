package com.webpro.player.domain.model

data class LiveChannel(
    val streamId: Long,
    val number: Int,
    val name: String,
    val logoUrl: String?,
    val categoryId: String?,
    val epgChannelId: String?,
    val hasArchive: Boolean
)
