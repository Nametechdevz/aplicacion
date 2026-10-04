package com.webpro.player.data

import com.webpro.player.data.api.JsonResponseReader
import com.webpro.player.data.api.XtreamApiFactory
import com.webpro.player.data.repository.XtreamRepositoryImpl
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.DataResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class XtreamRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var credentials: Credentials
    private lateinit var repository: XtreamRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        credentials = Credentials(server.url("/").toString().trimEnd('/'), "juan", "secreto")
        repository = XtreamRepositoryImpl(
            apiFactory = XtreamApiFactory(OkHttpClient()),
            reader = JsonResponseReader(Json { isLenient = true; ignoreUnknownKeys = true }),
            credentialsProvider = { credentials },
            io = Dispatchers.IO
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `authenticate sends credentials as query parameters`() = runTest {
        server.enqueue(MockResponse().setBody("""{"user_info":{"auth":1,"username":"juan","status":"Active"}}"""))
        val result = repository.authenticate(credentials)
        assertTrue(result is DataResult.Success)
        val request = server.takeRequest()
        assertEquals("/player_api.php", request.requestUrl!!.encodedPath)
        assertEquals("juan", request.requestUrl!!.queryParameter("username"))
        assertEquals("secreto", request.requestUrl!!.queryParameter("password"))
    }

    @Test
    fun `wrong credentials and http errors are mapped`() = runTest {
        server.enqueue(MockResponse().setBody("""{"user_info":{"auth":0}}"""))
        assertEquals(DataResult.Failure(AppError.InvalidCredentials), repository.authenticate(credentials))
        server.enqueue(MockResponse().setResponseCode(403))
        assertEquals(DataResult.Failure(AppError.InvalidCredentials), repository.authenticate(credentials))
        server.enqueue(MockResponse().setBody("<html>Welcome to nginx</html>"))
        assertEquals(DataResult.Failure(AppError.InvalidResponse), repository.authenticate(credentials))
        server.enqueue(MockResponse().setResponseCode(500))
        assertEquals(DataResult.Failure(AppError.Http(500)), repository.authenticate(credentials))
    }

    @Test
    fun `lists are parsed, deduplicated and cached`() = runTest {
        server.enqueue(
            MockResponse().setBody(
                "﻿ [ {\"stream_id\":1,\"name\":\"Uno\",\"category_id\":\"3\"}, {\"stream_id\":\"1\",\"name\":\"Uno bis\"}," +
                    " {\"name\":\"sin id\"}, {\"stream_id\":2,\"name\":\"Dos\"} ]"
            )
        )
        val first = repository.liveChannels()
        val second = repository.liveChannels()
        assertEquals(listOf(1L, 2L), first.getOrNull()!!.map { it.streamId })
        assertEquals(first, second)
        assertEquals(1, server.requestCount)
        assertEquals("get_live_streams", server.takeRequest().requestUrl!!.queryParameter("action"))
    }

    @Test
    fun `concurrent callers share one download`() = runTest {
        server.enqueue(MockResponse().setBody("""[{"stream_id":1,"name":"A"}]"""))
        val a = async { repository.movies() }
        val b = async { repository.movies() }
        assertEquals(a.await(), b.await())
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `object shaped lists and empty bodies are accepted`() = runTest {
        server.enqueue(MockResponse().setBody("""{"0":{"category_id":"1","category_name":"Cine"}}"""))
        assertEquals(listOf("Cine"), repository.movieCategories().getOrNull()!!.map { it.name })
        server.enqueue(MockResponse().setBody(""))
        assertEquals(emptyList<Any>(), repository.seriesCategories().getOrNull())
    }

    @Test
    fun `force refresh downloads again`() = runTest {
        server.enqueue(MockResponse().setBody("""[{"series_id":1,"name":"A"}]"""))
        server.enqueue(MockResponse().setBody("""[{"series_id":1,"name":"A"},{"series_id":2,"name":"B"}]"""))
        assertEquals(1, repository.series().getOrNull()!!.size)
        assertEquals(2, repository.series(forceRefresh = true).getOrNull()!!.size)
    }

    @Test
    fun `failed downloads are not cached`() = runTest {
        server.enqueue(MockResponse().setResponseCode(502))
        server.enqueue(MockResponse().setBody("""[{"stream_id":5,"name":"A"}]"""))
        assertEquals(DataResult.Failure(AppError.Http(502)), repository.liveChannels())
        assertEquals(1, repository.liveChannels().getOrNull()!!.size)
    }

    @Test
    fun `series details parsed and cached`() = runTest {
        server.enqueue(
            MockResponse().setBody("""{"info":{"name":"Serie"},"episodes":{"1":[{"id":"7","episode_num":1,"title":"Piloto"}]}}""")
        )
        val details = repository.seriesDetails(10).getOrNull()!!
        assertEquals("Piloto", details.allEpisodes.single().title)
        repository.seriesDetails(10)
        assertEquals(1, server.requestCount)
        val request = server.takeRequest().requestUrl!!
        assertEquals("get_series_info", request.queryParameter("action"))
        assertEquals("10", request.queryParameter("series_id"))
    }

    @Test
    fun `unreachable server is reported`() = runTest {
        server.shutdown()
        val result = repository.authenticate(credentials)
        assertEquals(DataResult.Failure(AppError.ServerUnreachable), result)
    }
}
