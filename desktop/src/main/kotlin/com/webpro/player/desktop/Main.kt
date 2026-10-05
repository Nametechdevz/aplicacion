package com.webpro.player.desktop

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.WindowPosition
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import com.webpro.player.desktop.ui.DesktopApp
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.WindowController
import org.jetbrains.skia.Image
import java.awt.Dimension

fun main() {
    // Smooth rendering and correct text on HiDPI Windows screens.
    System.setProperty("sun.java2d.uiScale.enabled", "true")
    System.setProperty("skiko.vsync.enabled", "true")

    application {
        val container = remember { DesktopContainer() }
        val windowState = rememberWindowState(
            size = DpSize(1366.dp, 840.dp),
            position = WindowPosition(Alignment.Center)
        )
        val icon = remember {
            Thread.currentThread().contextClassLoader.getResourceAsStream("icon.png")?.use { stream ->
                BitmapPainter(Image.makeFromEncoded(stream.readBytes()).toComposeImageBitmap())
            }
        }
        var previousPlacement by remember { mutableStateOf(WindowPlacement.Floating) }
        val controller = remember(windowState) {
            object : WindowController {
                override val isFullscreen: Boolean get() = windowState.placement == WindowPlacement.Fullscreen
                override fun toggleFullscreen() {
                    if (isFullscreen) exitFullscreen()
                    else {
                        previousPlacement = windowState.placement
                        windowState.placement = WindowPlacement.Fullscreen
                    }
                }
                override fun exitFullscreen() {
                    if (isFullscreen) windowState.placement = previousPlacement
                }
            }
        }
        Window(
            onCloseRequest = {
                container.shutdown()
                exitApplication()
            },
            state = windowState,
            title = S.APP_NAME,
            icon = icon
        ) {
            window.minimumSize = Dimension(1100, 680)
            DesktopApp(container, controller)
        }
    }
}
