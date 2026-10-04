package com.webpro.player.navigation

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.webpro.player.domain.model.ContentType
import com.webpro.player.player.PlayerArgs
import com.webpro.player.player.ui.PlayerScreen
import com.webpro.player.ui.login.LoginScreen
import com.webpro.player.ui.main.MainScreen
import com.webpro.player.ui.movies.MovieDetailScreen
import com.webpro.player.ui.series.SeriesDetailScreen
import com.webpro.player.ui.splash.SplashScreen

/** Callbacks shared by every screen that can open content. */
class ContentNavigator(private val navController: NavHostController) {
    fun openMovie(id: Long) = navController.navigateSafely(Routes.movieDetail(id))
    fun openSeries(id: Long) = navController.navigateSafely(Routes.seriesDetail(id))

    fun playChannel(id: Long, title: String, categoryId: String?) =
        navController.navigateSafely(Routes.player(ContentType.LIVE, id, title, categoryId = categoryId)) {
            launchSingleTop = true
        }

    fun playMovie(id: Long, title: String, extension: String?, resume: Boolean = true) =
        navController.navigateSafely(Routes.player(ContentType.MOVIE, id, title, extension, resume = resume)) {
            launchSingleTop = true
        }

    fun playEpisode(id: Long, title: String, extension: String?, seriesId: Long, resume: Boolean = true) =
        navController.navigateSafely(
            Routes.player(ContentType.EPISODE, id, title, extension, seriesId = seriesId, resume = resume)
        ) { launchSingleTop = true }

    fun back() = navController.popSafely()

    fun toLogin() {
        navController.navigate(Routes.LOGIN) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }
}

@Composable
fun AppNavHost(isLoggedIn: Boolean, navController: NavHostController = rememberNavController()) {
    val navigator = remember(navController) { ContentNavigator(navController) }
    // Session lost (logout, expired non-remembered session after process death): back to login.
    LaunchedEffect(isLoggedIn) {
        val route = navController.currentDestination?.route
        if (!isLoggedIn && route != null && route != Routes.SPLASH && route != Routes.LOGIN) {
            navigator.toLogin()
        }
    }
    NavHost(
        navController = navController,
        startDestination = Routes.SPLASH,
        enterTransition = { fadeIn() },
        exitTransition = { fadeOut() },
        popEnterTransition = { fadeIn() },
        popExitTransition = { fadeOut() }
    ) {
        composable(Routes.SPLASH) {
            SplashScreen(
                onLoggedIn = {
                    navController.navigate(Routes.MAIN) { popUpTo(Routes.SPLASH) { inclusive = true } }
                },
                onLoggedOut = {
                    navController.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) { inclusive = true } }
                }
            )
        }
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            )
        }
        composable(Routes.MAIN) {
            MainScreen(navigator = navigator)
        }
        composable(
            Routes.MOVIE_DETAIL,
            arguments = listOf(navArgument(Routes.ARG_ID) { type = NavType.LongType })
        ) {
            MovieDetailScreen(navigator = navigator)
        }
        composable(
            Routes.SERIES_DETAIL,
            arguments = listOf(navArgument(Routes.ARG_ID) { type = NavType.LongType })
        ) {
            SeriesDetailScreen(navigator = navigator)
        }
        composable(
            Routes.PLAYER,
            arguments = listOf(
                navArgument(PlayerArgs.TYPE) { type = NavType.StringType; defaultValue = ContentType.LIVE.name },
                navArgument(PlayerArgs.ID) { type = NavType.LongType; defaultValue = -1L },
                navArgument(PlayerArgs.TITLE) { type = NavType.StringType; defaultValue = "" },
                navArgument(PlayerArgs.EXT) { type = NavType.StringType; defaultValue = "" },
                navArgument(PlayerArgs.SERIES_ID) { type = NavType.LongType; defaultValue = -1L },
                navArgument(PlayerArgs.CATEGORY_ID) { type = NavType.StringType; defaultValue = "" },
                navArgument(PlayerArgs.RESUME) { type = NavType.BoolType; defaultValue = true }
            )
        ) {
            PlayerScreen(onBack = { navigator.back() })
        }
    }
}
