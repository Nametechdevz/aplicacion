package com.webpro.player.domain.model

/** Preferred container for live channels. */
enum class LiveStreamFormat {
    /** HLS when the account allows it, MPEG-TS otherwise. */
    AUTO,
    HLS,
    TS;

    companion object {
        fun fromName(value: String?): LiveStreamFormat =
            entries.firstOrNull { it.name == value } ?: AUTO
    }
}

data class AppSettings(
    val liveStreamFormat: LiveStreamFormat = LiveStreamFormat.AUTO,
    val autoPlayNextEpisode: Boolean = true
)
