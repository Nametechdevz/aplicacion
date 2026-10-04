package com.webpro.player.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TextAndTimeTest {

    @Test
    fun `normalizer removes accents and case`() {
        assertEquals("pelicula accion", TextNormalizer.normalize("  Película   ACCIÓN "))
    }

    @Test
    fun `matches requires every word`() {
        val text = TextNormalizer.normalize("ESPN Deportes HD")
        assertTrue(TextNormalizer.matches(text, "deportes espn"))
        assertFalse(TextNormalizer.matches(text, "fox deportes"))
        assertTrue(TextNormalizer.matches(text, ""))
    }

    @Test
    fun `playback time formatting`() {
        assertEquals("00:00", TimeFormat.playback(-5))
        assertEquals("01:23", TimeFormat.playback(83_000))
        assertEquals("1:02:03", TimeFormat.playback(3_723_000))
    }

    @Test
    fun `duration parsing tolerates server formats`() {
        assertEquals(6300L, TimeFormat.parseDurationToSeconds("01:45:00"))
        assertEquals(2700L, TimeFormat.parseDurationToSeconds("45:00"))
        assertEquals(5400L, TimeFormat.parseDurationToSeconds("90 min"))
        assertEquals(6000L, TimeFormat.parseDurationToSeconds("100"))
        assertNull(TimeFormat.parseDurationToSeconds(""))
        assertNull(TimeFormat.parseDurationToSeconds(null))
        assertNull(TimeFormat.parseDurationToSeconds("n/a"))
    }

    @Test
    fun `human duration`() {
        assertEquals("1 h 45 min", TimeFormat.humanDuration(6300))
        assertEquals("2 h", TimeFormat.humanDuration(7200))
        assertEquals("45 min", TimeFormat.humanDuration(2700))
    }

    @Test
    fun `log redactor hides credentials`() {
        val redacted = LogRedactor.redact(
            "GET http://s.com/player_api.php?username=juan&password=secreto and http://s.com/live/juan/secreto/1.ts"
        )
        assertFalse(redacted.contains("secreto"))
        assertFalse(redacted.contains("juan"))
        assertTrue(redacted.contains("/live/***/***/1.ts"))
    }
}
