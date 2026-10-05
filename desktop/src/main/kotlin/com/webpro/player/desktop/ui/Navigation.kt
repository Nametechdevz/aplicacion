package com.webpro.player.desktop.ui

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.staticCompositionLocalOf
import com.webpro.player.domain.model.ContentType

enum class Section { HOME, LIVE, MOVIES, SERIES, FAVORITES, SEARCH, SETTINGS }

data class PlayerTarget(
    val type: ContentType,
    val id: Long,
    val title: String,
    val extension: String? = null,
    val seriesId: Long? = null,
    val categoryId: String? = null,
    val resume: Boolean = true
)

sealed interface Screen {
    data object Splash : Screen
    data object Login : Screen
    data object Main : Screen
    data class MovieDetail(val id: Long) : Screen
    data class SeriesDetail(val id: Long) : Screen
    data class Player(val target: PlayerTarget) : Screen
}

/** Simple back stack for the desktop app (no Android navigation component needed). */
class Navigator {
    val stack = mutableStateListOf<Screen>(Screen.Splash)
    val current: Screen get() = stack.last()

    fun push(screen: Screen) {
        if (stack.last() == screen) return // double click guard
        if (screen is Screen.Player && stack.last() is Screen.Player) stack[stack.lastIndex] = screen
        else stack.add(screen)
    }

    fun back(): Boolean {
        if (stack.size <= 1) return false
        stack.removeAt(stack.lastIndex)
        return true
    }

    fun replaceAll(screen: Screen) {
        stack.clear()
        stack.add(screen)
    }

    fun openMovie(id: Long) = push(Screen.MovieDetail(id))
    fun openSeries(id: Long) = push(Screen.SeriesDetail(id))
    fun play(target: PlayerTarget) = push(Screen.Player(target))
}

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("Navigator not provided") }
