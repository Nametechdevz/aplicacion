package com.webpro.player.domain.model

/** The three kinds of content exposed by an Xtream Codes server (plus series episodes). */
enum class ContentType {
    LIVE,
    MOVIE,
    SERIES,
    EPISODE;

    companion object {
        fun fromName(value: String?): ContentType? =
            entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
    }
}
