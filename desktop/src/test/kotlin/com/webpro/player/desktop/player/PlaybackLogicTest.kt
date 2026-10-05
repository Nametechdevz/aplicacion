package com.webpro.player.desktop.player

import com.webpro.player.player.PlayerError
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackLogicTest {

    @Test
    fun `http diagnosis`() {
        assertEquals(PlayerError.Unauthorized, PlaybackDiagnosis.classify(ProbeResult.Http(401), false))
        assertEquals(PlayerError.Forbidden, PlaybackDiagnosis.classify(ProbeResult.Http(403), true))
        assertEquals(PlayerError.NotFound, PlaybackDiagnosis.classify(ProbeResult.Http(404), false))
        assertEquals(PlayerError.ServerError(503), PlaybackDiagnosis.classify(ProbeResult.Http(503), true))
        assertTrue(PlaybackDiagnosis.classify(ProbeResult.Http(503), true).recoverable)
        assertFalse(PlaybackDiagnosis.classify(ProbeResult.Http(403), true).recoverable)
    }

    @Test
    fun `healthy server means dropped connection or bad format`() {
        assertEquals(PlayerError.ConnectionReset, PlaybackDiagnosis.classify(ProbeResult.Http(200), playedBefore = true))
        assertEquals(PlayerError.Source, PlaybackDiagnosis.classify(ProbeResult.Http(206), playedBefore = false))
        assertEquals(PlayerError.Timeout, PlaybackDiagnosis.classify(ProbeResult.Timeout, false))
        assertEquals(PlayerError.Network, PlaybackDiagnosis.classify(ProbeResult.Unreachable, true))
    }

    @Test
    fun `vlc options`() {
        val live = VlcOptions.mediaOptions(isLive = true, networkCachingMs = 2000, startPositionMs = 50_000).toList()
        assertTrue(":network-caching=2000" in live)
        assertTrue(":http-reconnect" in live)
        assertFalse(live.any { it.startsWith(":start-time") })

        val vod = VlcOptions.mediaOptions(isLive = false, networkCachingMs = 1000, startPositionMs = 90_500).toList()
        assertTrue(":network-caching=3000" in vod)
        assertTrue(":start-time=90.5" in vod)
        assertFalse(vod.any { it.startsWith(":adaptive-maxheight") })

        val capped = VlcOptions.mediaOptions(isLive = true, networkCachingMs = 7000, startPositionMs = 0, maxHeight = 720).toList()
        assertTrue(":network-caching=7000" in capped)
        assertTrue(":adaptive-maxheight=720" in capped)

        assertTrue("--avcodec-hw=any" in VlcOptions.factoryArgs(true))
        assertTrue("--avcodec-hw=none" in VlcOptions.factoryArgs(false))
    }
}
