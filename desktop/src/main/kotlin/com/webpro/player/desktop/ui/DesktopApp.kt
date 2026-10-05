package com.webpro.player.desktop.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webpro.player.desktop.DesktopContainer
import com.webpro.player.desktop.ui.components.LocalImageLoader
import com.webpro.player.desktop.ui.screens.LoginScreen
import com.webpro.player.desktop.ui.screens.MainScreen
import com.webpro.player.desktop.ui.screens.MovieDetailScreen
import com.webpro.player.desktop.ui.screens.PlayerScreen
import com.webpro.player.desktop.ui.screens.SeriesDetailScreen
import com.webpro.player.domain.model.DataResult
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.theme.WebProBrushes
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.ui.theme.WebProTheme
import kotlinx.coroutines.launch

@Composable
fun DesktopApp(container: DesktopContainer, windowController: WindowController) {
    val navigator = remember { Navigator() }
    val session by container.sessionRepository.session.collectAsState()

    LaunchedEffect(Unit) {
        container.playerManager.warmUp()
        val restored = runCatching { container.sessionRepository.restore() }.getOrDefault(false)
        navigator.replaceAll(if (restored) Screen.Main else Screen.Login)
        if (restored) {
            val credentials = container.sessionRepository.session.value?.credentials
            if (credentials != null) container.applicationScope.launch {
                val result = container.xtreamRepository.authenticate(credentials)
                if (result is DataResult.Success) container.sessionRepository.updateAccount(result.data)
            }
        }
    }
    // Session lost (logout or data deleted): back to the login screen.
    LaunchedEffect(session) {
        val current = navigator.current
        if (session == null && current != Screen.Splash && current != Screen.Login) navigator.replaceAll(Screen.Login)
    }

    WebProTheme {
        CompositionLocalProvider(
            LocalContainer provides container,
            LocalNavigator provides navigator,
            LocalWindowController provides windowController,
            LocalImageLoader provides container.imageLoader
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(WebProColors.Background)
                    .onPreviewKeyEvent { e ->
                        // Alt+← / mouse-less back navigation outside the player.
                        if (e.type == KeyEventType.KeyDown && e.isAltPressed && e.key == Key.DirectionLeft) navigator.back() else false
                    }
            ) {
                AnimatedContent(
                    targetState = navigator.current,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "screens"
                ) { screen ->
                    when (screen) {
                        Screen.Splash -> Splash()
                        Screen.Login -> LoginScreen()
                        Screen.Main -> MainScreen()
                        is Screen.MovieDetail -> MovieDetailScreen(screen.id)
                        is Screen.SeriesDetail -> SeriesDetailScreen(screen.id)
                        is Screen.Player -> PlayerScreen(screen.target)
                    }
                }
            }
        }
    }
}

@Composable
private fun Splash() {
    Box(Modifier.fillMaxSize().background(WebProBrushes.BackgroundGlow), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            AppLogo(iconSize = 64.dp, textSize = 34.sp)
            Spacer(Modifier.height(14.dp))
            Text(S.TAGLINE, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary)
            Spacer(Modifier.height(32.dp))
            LinearProgressIndicator(Modifier.width(200.dp), color = WebProColors.Primary, trackColor = WebProColors.SurfaceHighest)
        }
    }
}
