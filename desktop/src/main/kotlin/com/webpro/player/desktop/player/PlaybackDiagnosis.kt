package com.webpro.player.desktop.player

import com.webpro.player.player.PlayerError

/** Maps what we know about a failed stream to a [PlayerError] (pure, unit tested). */
object PlaybackDiagnosis {

    /**
     * @param probe direct HTTP check of the stream URL
     * @param playedBefore whether this source produced playback before failing
     */
    fun classify(probe: ProbeResult, playedBefore: Boolean): PlayerError = when (probe) {
        is ProbeResult.Http -> when (probe.code) {
            401 -> PlayerError.Unauthorized
            403 -> PlayerError.Forbidden
            404, 410 -> PlayerError.NotFound
            429, in 500..599 -> PlayerError.ServerError(probe.code)
            in 400..499 -> PlayerError.ServerError(probe.code)
            // The server answers fine: a dropped stream is a connection issue,
            // a stream that never started is a format/source issue.
            else -> if (playedBefore) PlayerError.ConnectionReset else PlayerError.Source
        }
        ProbeResult.Timeout -> PlayerError.Timeout
        ProbeResult.Unreachable -> PlayerError.Network
    }
}
