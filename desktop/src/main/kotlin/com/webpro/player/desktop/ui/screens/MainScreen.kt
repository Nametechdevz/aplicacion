package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.DesktopContainer
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.Section
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.Series
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.theme.WebProColors

/** Catalog models live as long as the main shell so switching sections keeps lists, filters and scroll. */
class CatalogHolder(private val c: DesktopContainer) {
    private var liveModel: CatalogModel<LiveChannel>? = null
    private var movieModel: CatalogModel<Movie>? = null
    private var seriesModel: CatalogModel<Series>? = null

    val live: CatalogModel<LiveChannel>
        get() = liveModel ?: CatalogModel(LiveSource(c.xtreamRepository), c.favoritesRepository).also { liveModel = it }
    val movies: CatalogModel<Movie>
        get() = movieModel ?: CatalogModel(MovieSource(c.xtreamRepository), c.favoritesRepository).also { movieModel = it }
    val series: CatalogModel<Series>
        get() = seriesModel ?: CatalogModel(SeriesSource(c.xtreamRepository), c.favoritesRepository).also { seriesModel = it }

    fun dispose() {
        liveModel?.onDispose()
        movieModel?.onDispose()
        seriesModel?.onDispose()
    }
}

fun Section.iconVector(): ImageVector = when (this) {
    Section.HOME -> Icons.Rounded.Home
    Section.LIVE -> Icons.Rounded.LiveTv
    Section.MOVIES -> Icons.Rounded.Movie
    Section.SERIES -> Icons.Rounded.VideoLibrary
    Section.FAVORITES -> Icons.Rounded.Favorite
    Section.SEARCH -> Icons.Rounded.Search
    Section.SETTINGS -> Icons.Rounded.Settings
}

fun Section.label(): String = when (this) {
    Section.HOME -> S.HOME
    Section.LIVE -> S.LIVE
    Section.MOVIES -> S.MOVIES
    Section.SERIES -> S.SERIES
    Section.FAVORITES -> S.FAVORITES
    Section.SEARCH -> S.SEARCH
    Section.SETTINGS -> S.SETTINGS
}

@Composable
fun MainScreen() {
    val container = LocalContainer.current
    var section by rememberSaveable { mutableStateOf(Section.HOME) }
    val catalogs = remember { CatalogHolder(container) }
    DisposableEffect(catalogs) { onDispose { catalogs.dispose() } }

    Row(Modifier.fillMaxSize().background(WebProColors.Background)) {
        NavigationRail(
            containerColor = WebProColors.Surface,
            modifier = Modifier.fillMaxHeight(),
            header = { AppLogo(iconSize = 42.dp, showText = false, modifier = Modifier.padding(vertical = 18.dp)) }
        ) {
            Section.entries.forEach { item ->
                NavigationRailItem(
                    selected = item == section,
                    onClick = { section = item },
                    icon = { Icon(item.iconVector(), null) },
                    label = { Text(item.label()) },
                    colors = NavigationRailItemDefaults.colors(
                        selectedIconColor = WebProColors.TextPrimary,
                        selectedTextColor = WebProColors.TextPrimary,
                        indicatorColor = WebProColors.Primary,
                        unselectedIconColor = WebProColors.TextSecondary,
                        unselectedTextColor = WebProColors.TextSecondary
                    )
                )
                Spacer(Modifier.height(6.dp))
            }
        }
        Box(Modifier.weight(1f).fillMaxHeight()) {
            when (section) {
                Section.HOME -> HomeScreen(onOpenSection = { section = it })
                Section.LIVE -> LiveScreen(catalogs.live)
                Section.MOVIES -> MoviesScreen(catalogs.movies)
                Section.SERIES -> SeriesScreen(catalogs.series)
                Section.FAVORITES -> FavoritesScreen()
                Section.SEARCH -> SearchScreen()
                Section.SETTINGS -> SettingsScreen()
            }
        }
    }
}
