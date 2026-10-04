package com.webpro.player.domain

import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.usecase.StreamUrlBuilder
import org.junit.Assert.assertEquals
import org.junit.Test

class StreamUrlBuilderTest {

    private val builder = StreamUrlBuilder()
    private val credentials = Credentials("http://servidor.com:8080", "juan", "p@ss/word")

    @Test
    fun `live urls prefer hls in auto mode when allowed`() {
        val sources = builder.live(credentials, 42, LiveStreamFormat.AUTO, listOf("m3u8", "ts", "rtmp"))
        assertEquals(listOf("m3u8", "ts"), sources.map { it.extension })
        assertEquals("http://servidor.com:8080/live/juan/p@ss%2Fword/42.m3u8", sources.first().url)
    }

    @Test
    fun `live urls use ts when hls is not allowed`() {
        val sources = builder.live(credentials, 42, LiveStreamFormat.AUTO, listOf("ts"))
        assertEquals(listOf("ts"), sources.map { it.extension })
    }

    @Test
    fun `forced ts format keeps hls as fallback when allowed list is unknown`() {
        val sources = builder.live(credentials, 7, LiveStreamFormat.TS, emptyList())
        assertEquals(listOf("ts", "m3u8"), sources.map { it.extension })
    }

    @Test
    fun `vod and episodes use container extension`() {
        assertEquals("http://servidor.com:8080/movie/juan/p@ss%2Fword/10.mkv", builder.movie(credentials, 10, "MKV")?.url)
        assertEquals("http://servidor.com:8080/series/juan/p@ss%2Fword/99.mp4", builder.episode(credentials, 99, null)?.url)
        assertEquals("mp4", StreamUrlBuilder.sanitizeExtension("../../etc"))
        assertEquals("ts", StreamUrlBuilder.sanitizeExtension(".ts"))
    }

    @Test
    fun `sub path servers keep their path`() {
        val c = Credentials("https://cdn.servidor.com/xc", "u", "p")
        assertEquals("https://cdn.servidor.com/xc/movie/u/p/1.mp4", builder.movie(c, 1, "mp4")?.url)
    }

    @Test
    fun `stream source never prints its url`() {
        val source = builder.movie(credentials, 10, "mp4")!!
        assertEquals(false, source.toString().contains("juan"))
    }
}
