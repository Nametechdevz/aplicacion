package com.webpro.player.desktop.player

import com.webpro.player.desktop.storage.FileSettingsRepository
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.usecase.StreamSource
import com.webpro.player.player.PlaybackRequest
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerError
import com.webpro.player.player.PlayerState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * End-to-end playback through the real libVLC engine, served over HTTP like an IPTV
 * server. Runs when `-Dwebpro.test.media=<dir>` points to the generated test media
 * (live.ts with H.264+AC3, hls/index.m3u8, movie.mkv with AAC) and libVLC is found;
 * otherwise it is skipped.
 */
class VlcPlaybackIntegrationTest {

    private val mediaDir = System.getProperty("webpro.test.media")?.let(::File)
    private lateinit var server: MockWebServer
    private lateinit var manager: DesktopPlayerManager
    private val hits = java.util.concurrent.ConcurrentHashMap<String, Int>()

    @Before
    fun setUp() {
        assumeTrue("test media not configured", mediaDir?.isDirectory == true)
        assumeTrue("libVLC not available", VlcRuntime.initialize())
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath
                hits.merge(path, 1, Int::plus)
                return when {
                    path.startsWith("/forbidden") -> MockResponse().setResponseCode(403)
                    path.startsWith("/missing") -> MockResponse().setResponseCode(404)
                    else -> {
                        val file = File(mediaDir, path.removePrefix("/"))
                        if (!file.isFile) MockResponse().setResponseCode(404) else serveFile(file, request)
                    }
                }
            }
        }
        server.start()
        val dataDir = Files.createTempDirectory("webpro-test").toFile()
        val settings = FileSettingsRepository(dataDir, Json { ignoreUnknownKeys = true })
        manager = DesktopPlayerManager(settings, StreamProbe(OkHttpClient()))
    }

    @After
    fun tearDown() {
        if (::manager.isInitialized) runBlocking(Dispatchers.Main) { manager.shutdown() }
        if (::server.isInitialized) server.shutdown()
    }

    /** Static file with HTTP Range support, like a real VOD server. */
    private fun serveFile(file: File, request: RecordedRequest): MockResponse {
        val bytes = file.readBytes()
        val range = request.getHeader("Range")?.let { Regex("bytes=(\\d+)-(\\d*)").find(it) }
        val base = MockResponse().setHeader("Content-Type", contentType(file.name)).setHeader("Accept-Ranges", "bytes")
        if (range == null) return base.setBody(Buffer().write(bytes))
        val start = range.groupValues[1].toInt().coerceAtMost(bytes.size)
        val end = range.groupValues[2].toIntOrNull()?.coerceAtMost(bytes.size - 1) ?: (bytes.size - 1)
        if (start > end) return MockResponse().setResponseCode(416)
        return base.setResponseCode(206)
            .setHeader("Content-Range", "bytes $start-$end/${bytes.size}")
            .setBody(Buffer().write(bytes, start, end - start + 1))
    }

    private fun contentType(name: String) = when {
        name.endsWith(".m3u8") -> "application/vnd.apple.mpegurl"
        name.endsWith(".ts") -> "video/mp2t"
        else -> "video/x-matroska"
    }

    private fun request(type: ContentType, vararg paths: String) = PlaybackRequest(
        type = type,
        contentId = paths.first().hashCode().toLong(),
        title = "test",
        sources = paths.map { StreamSource(server.url(it).toString(), it.substringAfterLast('.')) }
    )

    private suspend fun awaitState(timeoutMs: Long, predicate: (PlayerState) -> Boolean): PlayerState? {
        val result = withTimeoutOrNull(timeoutMs) {
            while (true) {
                val s = withContext(Dispatchers.Main) { manager.state.value }
                if (predicate(s)) return@withTimeoutOrNull s
                delay(100)
            }
            @Suppress("UNREACHABLE_CODE") null
        }
        if (result == null) dumpThreads()
        return result
    }

    /** Diagnostics for CI: where are the libVLC threads stuck? */
    private fun dumpThreads() {
        System.err.println("=== Thread dump (state=${manager.state.value}) ===")
        Thread.getAllStackTraces().forEach { (thread, stack) ->
            if (thread.name.contains("vlc", true) || thread.name.contains("AWT", true) || thread.name.contains("event", true)) {
                System.err.println("Thread ${thread.name} (${thread.state})")
                stack.take(25).forEach { System.err.println("    at $it") }
            }
        }
    }

    @Test
    fun `live mpeg-ts with ac3 audio plays video frames and exposes the audio track`() = runBlocking {
        withContext(Dispatchers.Main) { manager.play("owner", request(ContentType.LIVE, "/live.ts")) }
        val playing = awaitState(20_000) { it.status == PlaybackStatus.PLAYING && it.positionMs > 1_500 }
        assertTrue("never reached PLAYING: ${manager.state.value}", playing != null)
        val frames = withTimeoutOrNull(10_000) {
            while (!withContext(Dispatchers.Main) { manager.sink.hasVideo }) delay(100)
            true
        }
        assertEquals("video frames should be rendered", true, frames)
        val tracks = withTimeoutOrNull(10_000) {
            while (withContext(Dispatchers.Main) { manager.tracks.value.audio.isEmpty() }) delay(200)
            withContext(Dispatchers.Main) { manager.tracks.value }
        }
        assertTrue("AC3 audio track must be decoded: $tracks", tracks != null && tracks.audio.isNotEmpty())
        val geometry = withTimeoutOrNull(5_000) {
            while (withContext(Dispatchers.Main) { manager.sink.sourceHeight } != 360) delay(100)
            withContext(Dispatchers.Main) { Triple(manager.sink.sourceWidth, manager.sink.sourceHeight, manager.sink.aspectRatio) }
        }
        assertTrue("padding must be cropped to 640x360: $geometry", geometry != null && geometry.first == 640)
        assertEquals(16f / 9f, geometry!!.third, 0.02f)
    }

    @Test
    fun `hls playlist plays`() = runBlocking {
        withContext(Dispatchers.Main) { manager.play("owner", request(ContentType.LIVE, "/hls/index.m3u8")) }
        val playing = awaitState(25_000) { it.status == PlaybackStatus.PLAYING && it.positionMs > 1_000 }
        assertTrue("HLS never played: ${manager.state.value}", playing != null)
    }

    @Test
    fun `missing hls falls back to mpeg-ts`() = runBlocking {
        withContext(Dispatchers.Main) {
            manager.play("owner", request(ContentType.LIVE, "/missing/index.m3u8", "/live.ts"))
        }
        val playing = awaitState(30_000) { it.status == PlaybackStatus.PLAYING && it.sourceIndex == 1 }
        assertTrue("did not fall back to TS: ${manager.state.value}", playing != null)
    }

    @Test
    fun `forbidden stream is reported without retry loops`() = runBlocking {
        withContext(Dispatchers.Main) { manager.play("owner", request(ContentType.LIVE, "/forbidden/1.ts")) }
        val failed = awaitState(20_000) { it.status == PlaybackStatus.ERROR }
        assertEquals(PlayerError.Forbidden, failed?.error)
        assertEquals("auth errors must not be retried", 0, failed?.retryAttempt)
        // Once reported, nothing keeps hammering the server.
        val requestsAtError = hits["/forbidden/1.ts"] ?: 0
        delay(4_000)
        assertEquals(requestsAtError, hits["/forbidden/1.ts"] ?: 0)
    }

    @Test
    fun `vod mkv with aac is seekable and resumes from start position`() = runBlocking {
        val req = request(ContentType.MOVIE, "/movie.mkv").copy(startPositionMs = 10_000)
        withContext(Dispatchers.Main) { manager.play("owner", req) }
        val playing = awaitState(20_000) { it.status == PlaybackStatus.PLAYING && it.durationMs > 0 && it.positionMs > 0 }
        assertTrue("movie never played: ${manager.state.value}", playing != null)
        assertTrue("should start near 10 s, was ${playing!!.positionMs}", playing.positionMs >= 9_000)
        assertTrue("movie must be seekable", playing.canSeek)
        withContext(Dispatchers.Main) { manager.seekTo(20_000) }
        val seeked = awaitState(10_000) { it.positionMs >= 19_000 }
        assertTrue("seek did not apply: ${manager.state.value}", seeked != null)
    }

    @Test
    fun `live channel cut by the server reconnects automatically`() = runBlocking {
        // short.ts lasts 4 s: for a live channel the end of the body means the server dropped us.
        withContext(Dispatchers.Main) { manager.play("owner", request(ContentType.LIVE, "/short.ts")) }
        assertTrue(awaitState(20_000) { it.status == PlaybackStatus.PLAYING } != null)
        val reconnected = withTimeoutOrNull(30_000) {
            while ((hits["/short.ts"] ?: 0) < 2) delay(200)
            true
        }
        assertEquals("the player must reconnect after the cut", true, reconnected)
        val playingAgain = awaitState(20_000) { it.status == PlaybackStatus.PLAYING }
        assertTrue("playback did not resume: ${manager.state.value}", playingAgain != null)
    }
}
