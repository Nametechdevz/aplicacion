package com.webpro.player.data

import com.webpro.player.data.model.AuthParseResult
import com.webpro.player.data.model.XtreamParsers
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class XtreamParsersTest {

    private val json = Json { isLenient = true; ignoreUnknownKeys = true }
    private fun parse(text: String) = json.parseToJsonElement(text)

    @Test
    fun `auth success with mixed types`() {
        val result = XtreamParsers.parseAuth(
            parse(
                """{"user_info":{"username":"juan","auth":1,"status":"Active","exp_date":"1767225600",
                "is_trial":"0","active_cons":"1","max_connections":2,"allowed_output_formats":["m3u8","ts"]},
                "server_info":{"timezone":"Europe/Madrid"}}"""
            ),
            "juan"
        )
        assertTrue(result is AuthParseResult.Authenticated)
        val account = (result as AuthParseResult.Authenticated).account
        assertEquals(1767225600L, account.expirationEpochSeconds)
        assertEquals(2, account.maxConnections)
        assertEquals(1, account.activeConnections)
        assertEquals(listOf("m3u8", "ts"), account.allowedOutputFormats)
        assertTrue(account.isActive)
    }

    @Test
    fun `auth failures`() {
        assertEquals(AuthParseResult.InvalidCredentials, XtreamParsers.parseAuth(parse("""{"user_info":{"auth":0}}"""), "x"))
        assertEquals(AuthParseResult.InvalidCredentials, XtreamParsers.parseAuth(parse("[]"), "x"))
        assertEquals(AuthParseResult.NotXtream, XtreamParsers.parseAuth(parse("""{"hello":"world"}"""), "x"))
        assertEquals(AuthParseResult.NotXtream, XtreamParsers.parseAuth(null, "x"))
    }

    @Test
    fun `null exp date means unlimited`() {
        val result = XtreamParsers.parseAuth(parse("""{"user_info":{"auth":"1","status":"Active","exp_date":null}}"""), "u")
        assertNull((result as AuthParseResult.Authenticated).account.expirationEpochSeconds)
    }

    @Test
    fun `live channel tolerates strings, nulls and missing fields`() {
        val channel = XtreamParsers.parseLiveChannel(
            parse("""{"num":"5","name":null,"stream_id":"123","stream_icon":"","category_id":7,"tv_archive":"1"}""")
        )
        assertNotNull(channel)
        assertEquals(123L, channel!!.streamId)
        assertEquals(5, channel.number)
        assertEquals("Canal 123", channel.name)
        assertNull(channel.logoUrl)
        assertEquals("7", channel.categoryId)
        assertTrue(channel.hasArchive)
        assertNull(XtreamParsers.parseLiveChannel(parse("""{"name":"Sin id"}""")))
        assertNull(XtreamParsers.parseLiveChannel(parse("\"text\"")))
    }

    @Test
    fun `movie year from field or name, rating fallback`() {
        val m1 = XtreamParsers.parseMovie(parse("""{"stream_id":1,"name":"Dune (2021)","rating_5based":4.1,"container_extension":"mkv"}"""))!!
        assertEquals("2021", m1.year)
        assertEquals(8.2, m1.rating!!, 0.001)
        assertEquals("mkv", m1.containerExtension)
        val m2 = XtreamParsers.parseMovie(parse("""{"stream_id":"2","name":"X","year":"1999","rating":"7,5"}"""))!!
        assertEquals("1999", m2.year)
        assertEquals(7.5, m2.rating!!, 0.001)
    }

    @Test
    fun `movie details accept info as empty array`() {
        val details = XtreamParsers.parseMovieDetails(
            parse("""{"info":[],"movie_data":{"stream_id":9,"name":"Film","container_extension":"mp4"}}"""),
            9,
            null
        )
        assertNotNull(details)
        assertEquals("Film", details!!.movie.name)
        assertEquals("mp4", details.movie.containerExtension)
        assertNull(details.plot)
    }

    @Test
    fun `movie details parse duration and backdrop arrays`() {
        val details = XtreamParsers.parseMovieDetails(
            parse(
                """{"info":{"plot":"Trama","genre":"Drama","duration":"01:45:00","releasedate":"2020-05-01",
                "backdrop_path":["https://img/b.jpg"],"movie_image":"https://img/p.jpg"},"movie_data":{"stream_id":3}}"""
            ),
            3,
            null
        )!!
        assertEquals(6300L, details.durationSeconds)
        assertEquals("1 h 45 min", details.durationLabel)
        assertEquals("https://img/b.jpg", details.backdropUrl)
        assertEquals("2020", details.year)
    }

    @Test
    fun `series details support episodes as object map`() {
        val details = XtreamParsers.parseSeriesDetails(
            parse(
                """{"seasons":[{"season_number":1,"name":"Temporada 1"},{"season_number":2,"name":""}],
                "info":{"name":"Serie","plot":"P"},
                "episodes":{"2":[{"id":"21","episode_num":"1","title":"S2E1","container_extension":"mp4"}],
                "1":[{"id":"12","episode_num":2,"title":"S1E2","info":{"duration_secs":"1500"}},
                     {"id":"11","episode_num":1,"title":"S1E1"}]}}"""
            ),
            100,
            null
        )!!
        assertEquals(listOf(1, 2), details.seasons.map { it.number })
        assertEquals("Temporada 2", details.seasons[1].name)
        assertEquals(listOf(11L, 12L), details.episodesBySeason[1]!!.map { it.id })
        assertEquals(1500L, details.episodesBySeason[1]!![1].durationSeconds)
        assertEquals(listOf(11L, 12L, 21L), details.allEpisodes.map { it.id })
    }

    @Test
    fun `series details support episodes as array of arrays`() {
        val details = XtreamParsers.parseSeriesDetails(
            parse("""{"info":{"name":"S"},"episodes":[[{"id":1,"season":1,"episode_num":1}],[{"id":2,"season":2,"episode_num":1}]]}"""),
            5,
            null
        )!!
        assertEquals(2, details.seasons.size)
        assertEquals("Episodio 1", details.episodesBySeason[2]!!.first().title)
    }

    @Test
    fun `series details with no data returns null`() {
        assertNull(XtreamParsers.parseSeriesDetails(parse("""{"info":[],"episodes":[]}"""), 1, null))
        assertNull(XtreamParsers.parseSeriesDetails(parse("[]"), 1, null))
    }
}
