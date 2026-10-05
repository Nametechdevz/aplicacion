package com.webpro.player.player

enum class PlaybackStatus {
    IDLE,
    PREPARING,
    BUFFERING,
    PLAYING,
    PAUSED,
    RECONNECTING,
    ENDED,
    ERROR
}

/** Single source of truth of the playback state, exposed by [PlayerManager.state]. */
data class PlayerState(
    val request: PlaybackRequest? = null,
    val status: PlaybackStatus = PlaybackStatus.IDLE,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val bufferedPositionMs: Long = 0L,
    val isLive: Boolean = false,
    val isSeekable: Boolean = false,
    val error: PlayerError? = null,
    val retryAttempt: Int = 0,
    val maxRetries: Int = 0,
    val sourceIndex: Int = 0,
    val isMuted: Boolean = false,
    val videoAspectRatio: Float? = null,
    /** 0..99 while (re)buffering, null otherwise. */
    val bufferPercent: Int? = null,
    /** Current buffer level (adapts to slow connections in AUTO mode). */
    val bufferProfile: BufferProfile = BufferProfile.NORMAL,
    /** Incremented each time the player raised the buffer because the connection was too slow. */
    val slowNetworkAdaptations: Int = 0
) {
    val isPlaying: Boolean get() = status == PlaybackStatus.PLAYING
    val isLoading: Boolean
        get() = status == PlaybackStatus.PREPARING || status == PlaybackStatus.BUFFERING ||
            status == PlaybackStatus.RECONNECTING
    val canSeek: Boolean get() = isSeekable && !isLive && durationMs > 0
}
