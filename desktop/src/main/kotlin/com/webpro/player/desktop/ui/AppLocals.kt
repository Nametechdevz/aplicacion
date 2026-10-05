package com.webpro.player.desktop.ui

import androidx.compose.runtime.staticCompositionLocalOf
import com.webpro.player.desktop.DesktopContainer

val LocalContainer = staticCompositionLocalOf<DesktopContainer> { error("Container not provided") }

/** Lets screens toggle the window's fullscreen mode. */
interface WindowController {
    val isFullscreen: Boolean
    fun toggleFullscreen()
    fun exitFullscreen()
}

val LocalWindowController = staticCompositionLocalOf<WindowController> { error("WindowController not provided") }
