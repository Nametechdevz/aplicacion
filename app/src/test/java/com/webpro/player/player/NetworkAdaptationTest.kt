package com.webpro.player.player

import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.MaxQuality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NetworkAdaptationTest {

    @Test
    fun `fixed modes map directly and ignore what was learned`() {
        assertEquals(BufferProfile.FAST, BufferProfile.initial(ConnectionMode.FAST, BufferProfile.VERY_SLOW))
        assertEquals(BufferProfile.SLOW, BufferProfile.initial(ConnectionMode.SLOW, null))
        assertEquals(BufferProfile.VERY_SLOW, BufferProfile.initial(ConnectionMode.VERY_SLOW, BufferProfile.NORMAL))
    }

    @Test
    fun `auto starts normal, reuses the learned level and the measured bandwidth`() {
        assertEquals(BufferProfile.NORMAL, BufferProfile.initial(ConnectionMode.AUTO, null))
        assertEquals(BufferProfile.SLOW, BufferProfile.initial(ConnectionMode.AUTO, BufferProfile.SLOW))
        assertEquals(BufferProfile.VERY_SLOW, BufferProfile.initial(ConnectionMode.AUTO, null, 1_000_000))
        assertEquals(BufferProfile.SLOW, BufferProfile.initial(ConnectionMode.AUTO, null, 3_000_000))
        assertEquals(BufferProfile.NORMAL, BufferProfile.initial(ConnectionMode.AUTO, null, 20_000_000))
        // The slower of both wins.
        assertEquals(BufferProfile.VERY_SLOW, BufferProfile.initial(ConnectionMode.AUTO, BufferProfile.VERY_SLOW, 20_000_000))
    }

    @Test
    fun `profiles grow monotonically`() {
        BufferProfile.entries.zipWithNext().forEach { (a, b) ->
            assertTrue(b.liveCachingMs > a.liveCachingMs)
            assertTrue(b.vodCachingMs > a.vodCachingMs)
            assertTrue(b.maxBufferMs > a.maxBufferMs)
            assertTrue(b.startBufferMs > a.startBufferMs)
            assertTrue(b.minBufferMs >= b.startBufferMs)
        }
        assertEquals(BufferProfile.VERY_SLOW, BufferProfile.VERY_SLOW.slower())
        assertEquals(BufferProfile.FAST, BufferProfile.FAST.faster())
    }

    @Test
    fun `quality cap`() {
        assertNull(BufferProfile.NORMAL.maxHeight(MaxQuality.AUTO))
        assertEquals(720, BufferProfile.SLOW.maxHeight(MaxQuality.AUTO))
        assertEquals(480, BufferProfile.VERY_SLOW.maxHeight(MaxQuality.AUTO))
        assertEquals(1080, BufferProfile.VERY_SLOW.maxHeight(MaxQuality.P1080))
        assertEquals(480, BufferProfile.FAST.maxHeight(MaxQuality.P480))
    }

    @Test
    fun `escalates after repeated stalls, one level at a time and bounded`() {
        var now = 0L
        val controller = AdaptiveBufferController(ConnectionMode.AUTO, BufferProfile.NORMAL, clock = { now })
        assertFalse(controller.onRebuffer())
        now += 10_000
        assertTrue(controller.onRebuffer())
        assertEquals(BufferProfile.SLOW, controller.profile)
        now += 10_000
        assertFalse(controller.onRebuffer())
        now += 10_000
        assertTrue(controller.onRebuffer())
        assertEquals(BufferProfile.VERY_SLOW, controller.profile)
        repeat(10) { now += 1_000; assertFalse(controller.onRebuffer()) }
        assertEquals(BufferProfile.VERY_SLOW, controller.profile)
    }

    @Test
    fun `isolated stalls do not escalate`() {
        var now = 0L
        val controller = AdaptiveBufferController(ConnectionMode.AUTO, BufferProfile.NORMAL, clock = { now })
        repeat(5) {
            assertFalse(controller.onRebuffer())
            now += 120_000
        }
        assertEquals(BufferProfile.NORMAL, controller.profile)
    }

    @Test
    fun `fixed modes never change`() {
        val controller = AdaptiveBufferController(ConnectionMode.FAST, BufferProfile.FAST, clock = { 0L })
        repeat(5) { assertFalse(controller.onRebuffer()) }
        assertEquals(BufferProfile.FAST, controller.profile)
    }

    @Test
    fun `names round trip`() {
        BufferProfile.entries.forEach { assertEquals(it, BufferProfile.fromName(it.name)) }
        assertNull(BufferProfile.fromName("bogus"))
        assertEquals(ConnectionMode.AUTO, ConnectionMode.fromName(null))
        assertEquals(MaxQuality.P720, MaxQuality.fromName("P720"))
    }
}
