package com.webpro.player.desktop.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.runDesktopComposeUiTest
import com.webpro.player.desktop.DesktopContainer
import com.webpro.player.desktop.player.TrackOption
import com.webpro.player.desktop.player.TrackState
import com.webpro.player.desktop.ui.components.LocalImageLoader
import com.webpro.player.desktop.ui.screens.MainScreen
import com.webpro.player.desktop.ui.screens.PlayerControls
import com.webpro.player.desktop.ui.screens.PlayerUiState
import com.webpro.player.desktop.ui.screens.ResizeMode
import com.webpro.player.desktop.ui.screens.LoginScreen
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.Session
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerState
import com.webpro.player.ui.theme.WebProTheme
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * Renders the main screens headless (no window) against a fake Xtream server and
 * saves screenshots to build/screenshots. Fails if a screen crashes or misses content.
 */
@OptIn(ExperimentalTestApi::class)
class UiSmokeTest {

    companion object {
        private lateinit var server: MockWebServer
        private lateinit var container: DesktopContainer

        @JvmStatic
        @BeforeClass
        fun setUp() {
            System.setProperty("webpro.dataDir", Files.createTempDirectory("webpro-ui").toString())
            server = MockWebServer()
            server.dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val body = when (request.requestUrl?.queryParameter("action")) {
                        "get_live_categories" -> """[{"category_id":"1","category_name":"Deportes"},{"category_id":"2","category_name":"Noticias"},{"category_id":"3","category_name":"Cine"}]"""
                        "get_live_streams" -> (1..30).joinToString(",", "[", "]") {
                            """{"num":$it,"name":"Canal ${listOf("Deportes", "Noticias 24h", "Cine Clásico", "Música HD", "Infantil")[it % 5]} $it","stream_id":$it,"category_id":"${it % 3 + 1}"}"""
                        }
                        "get_vod_categories" -> """[{"category_id":"10","category_name":"Estrenos"},{"category_id":"11","category_name":"Acción"}]"""
                        "get_vod_streams" -> (1..24).joinToString(",", "[", "]") {
                            """{"stream_id":${100 + it},"name":"Película de ejemplo $it (20${10 + it % 15})","rating":"${5 + it % 5}.5","category_id":"10","container_extension":"mkv"}"""
                        }
                        "get_series_categories" -> """[{"category_id":"20","category_name":"Drama"}]"""
                        "get_series" -> (1..12).joinToString(",", "[", "]") {
                            """{"series_id":${200 + it},"name":"Serie $it","genre":"Drama","releaseDate":"2021-01-01","category_id":"20"}"""
                        }
                        else -> """{"user_info":{"auth":1,"username":"demo","status":"Active","exp_date":"1924992000","max_connections":"2"}}"""
                    }
                    return MockResponse().setBody(body)
                }
            }
            server.start()
            container = DesktopContainer()
        }

        @JvmStatic
        @AfterClass
        fun tearDown() {
            server.shutdown()
        }
    }

    private val shots = File("build/screenshots").apply { mkdirs() }

    @Composable
    private fun Providers(content: @Composable () -> Unit) {
        val navigator = Navigator()
        val window = object : WindowController {
            override val isFullscreen = false
            override fun toggleFullscreen() = Unit
            override fun exitFullscreen() = Unit
        }
        WebProTheme {
            CompositionLocalProvider(
                LocalContainer provides container,
                LocalNavigator provides navigator,
                LocalWindowController provides window,
                LocalImageLoader provides container.imageLoader
            ) { content() }
        }
    }

    private fun SemanticsNodeInteractionsProvider.save(name: String) {
        val image = onRoot().captureToImage().toAwtImage()
        ImageIO.write(image, "png", File(shots, "$name.png"))
    }

    @Test
    fun loginScreenRenders() = runDesktopComposeUiTest(1366, 840) {
        setContent { Providers { LoginScreen() } }
        waitUntil(timeoutMillis = 10_000) { onAllNodes(hasText("CONECTAR")).fetchSemanticsNodes().isNotEmpty() }
        save("01-login")
    }

    @Test
    fun mainScreenWithCatalogRenders() = runDesktopComposeUiTest(1366, 840) {
        runBlocking {
            container.sessionRepository.saveSession(
                Session(Credentials(server.url("/").toString().trimEnd('/'), "demo", "demo"), null, remember = false)
            )
        }
        setContent { Providers { MainScreen() } }
        waitUntil(timeoutMillis = 10_000) { onAllNodes(hasText("Hola, demo")).fetchSemanticsNodes().isNotEmpty() }
        save("02-home")
    }

    @Test
    fun playerControlsRender() = runDesktopComposeUiTest(1366, 768) {
        val state = PlayerState(status = PlaybackStatus.PLAYING, positionMs = 1_234_000, durationMs = 5_400_000, isSeekable = true)
        val ui = PlayerUiState(type = ContentType.MOVIE, title = "Película de ejemplo", subtitle = "2024 · Acción", isResolving = false)
        setContent {
            Providers {
                Box(Modifier.fillMaxSize().background(Color(0xFF1B2440))) {
                    PlayerControls(
                        state = state, ui = ui, volume = 100,
                        tracks = TrackState(listOf(TrackOption(1, "Español - AC3 5.1"), TrackOption(2, "English - AAC")), 1),
                        resizeMode = ResizeMode.FIT, isFullscreen = false,
                        onInteraction = {}, onMenuOpenChange = {}, onBack = {}, onTogglePlay = {}, onSeekBy = {}, onSeekTo = {},
                        onPreviousChannel = {}, onNextChannel = {}, onOpenChannels = {}, onPreviousEpisode = {}, onNextEpisode = {},
                        onVolume = {}, onToggleMute = {}, onSelectAudio = {}, onSelectSubtitle = {}, onResize = {}, onToggleFullscreen = {}
                    )
                }
            }
        }
        waitUntil(timeoutMillis = 10_000) { onAllNodes(hasText("Película de ejemplo")).fetchSemanticsNodes().isNotEmpty() }
        save("03-player-controls")
    }
}
