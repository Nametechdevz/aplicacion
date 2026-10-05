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

/** How much the player buffers. AUTO starts normal and adapts when the stream stalls. */
enum class ConnectionMode {
    AUTO,
    FAST,
    SLOW,
    VERY_SLOW;

    companion object {
        fun fromName(value: String?): ConnectionMode = entries.firstOrNull { it.name == value } ?: AUTO
    }
}

/** Highest video height to pick when the server offers several qualities (adaptive HLS). */
enum class MaxQuality(val maxHeight: Int?) {
    AUTO(null),
    P1080(1080),
    P720(720),
    P480(480);

    companion object {
        fun fromName(value: String?): MaxQuality = entries.firstOrNull { it.name == value } ?: AUTO
    }
}

data class AppSettings(
    val liveStreamFormat: LiveStreamFormat = LiveStreamFormat.AUTO,
    val autoPlayNextEpisode: Boolean = true,
    val connectionMode: ConnectionMode = ConnectionMode.AUTO,
    val maxQuality: MaxQuality = MaxQuality.AUTO,
    /** Level learned in AUTO mode, reused on the next playback (persisted). */
    val learnedProfile: String? = null
)
