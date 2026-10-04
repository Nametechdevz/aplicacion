package com.webpro.player.navigation

import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.ui.graphics.vector.ImageVector
import com.webpro.player.R
import com.webpro.player.domain.model.ContentType
import com.webpro.player.player.PlayerArgs

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val MAIN = "main"

    const val MOVIE_DETAIL = "movie/{id}"
    const val SERIES_DETAIL = "series/{id}"
    const val ARG_ID = "id"

    const val PLAYER = "player?" +
        "${PlayerArgs.TYPE}={${PlayerArgs.TYPE}}&" +
        "${PlayerArgs.ID}={${PlayerArgs.ID}}&" +
        "${PlayerArgs.TITLE}={${PlayerArgs.TITLE}}&" +
        "${PlayerArgs.EXT}={${PlayerArgs.EXT}}&" +
        "${PlayerArgs.SERIES_ID}={${PlayerArgs.SERIES_ID}}&" +
        "${PlayerArgs.CATEGORY_ID}={${PlayerArgs.CATEGORY_ID}}&" +
        "${PlayerArgs.RESUME}={${PlayerArgs.RESUME}}"

    fun movieDetail(id: Long) = "movie/$id"
    fun seriesDetail(id: Long) = "series/$id"

    fun player(
        type: ContentType,
        id: Long,
        title: String,
        extension: String? = null,
        seriesId: Long? = null,
        categoryId: String? = null,
        resume: Boolean = true
    ): String = "player?" +
        "${PlayerArgs.TYPE}=${type.name}&" +
        "${PlayerArgs.ID}=$id&" +
        "${PlayerArgs.TITLE}=${Uri.encode(title)}&" +
        "${PlayerArgs.EXT}=${Uri.encode(extension.orEmpty())}&" +
        "${PlayerArgs.SERIES_ID}=${seriesId ?: -1L}&" +
        "${PlayerArgs.CATEGORY_ID}=${Uri.encode(categoryId.orEmpty())}&" +
        "${PlayerArgs.RESUME}=$resume"
}

/** Top-level sections shown in the bottom bar (phones) or navigation rail (tablets/TV). */
enum class Section(val route: String, @StringRes val labelRes: Int, val icon: ImageVector, val inBottomBar: Boolean) {
    HOME("section/home", R.string.section_home, Icons.Rounded.Home, true),
    LIVE("section/live", R.string.section_live, Icons.Rounded.LiveTv, true),
    MOVIES("section/movies", R.string.section_movies, Icons.Rounded.Movie, true),
    SERIES("section/series", R.string.section_series, Icons.Rounded.VideoLibrary, true),
    FAVORITES("section/favorites", R.string.section_favorites, Icons.Rounded.Favorite, false),
    SEARCH("section/search", R.string.section_search, Icons.Rounded.Search, true),
    SETTINGS("section/settings", R.string.section_settings, Icons.Rounded.Settings, false)
}
