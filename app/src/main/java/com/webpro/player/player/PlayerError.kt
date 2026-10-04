package com.webpro.player.player

/**
 * Playback failures understood by the app. [recoverable] errors are retried with
 * backoff; [tryAlternativeSource] errors switch to the next stream format.
 */
sealed class PlayerError(
    val recoverable: Boolean,
    val tryAlternativeSource: Boolean
) {
    data object Timeout : PlayerError(recoverable = true, tryAlternativeSource = true)
    data object ConnectionReset : PlayerError(recoverable = true, tryAlternativeSource = true)
    data object Network : PlayerError(recoverable = true, tryAlternativeSource = false)
    data object BehindLiveWindow : PlayerError(recoverable = true, tryAlternativeSource = false)
    data object Unauthorized : PlayerError(recoverable = false, tryAlternativeSource = false)
    data object Forbidden : PlayerError(recoverable = false, tryAlternativeSource = false)
    data object NotFound : PlayerError(recoverable = false, tryAlternativeSource = true)
    data class ServerError(val httpCode: Int) : PlayerError(recoverable = httpCode >= 500 || httpCode == 429, tryAlternativeSource = true)
    data object Source : PlayerError(recoverable = false, tryAlternativeSource = true)
    data object Decoder : PlayerError(recoverable = false, tryAlternativeSource = true)
    data object Unknown : PlayerError(recoverable = true, tryAlternativeSource = true)

    /** Errors that a returning network connection may fix. */
    val isConnectivityRelated: Boolean
        get() = this is Network || this is Timeout || this is ConnectionReset || this is Unknown ||
            (this is ServerError && recoverable)
}
