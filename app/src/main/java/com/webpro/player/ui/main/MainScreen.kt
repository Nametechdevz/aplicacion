package com.webpro.player.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.navigation.Section
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.favorites.FavoritesScreen
import com.webpro.player.ui.home.HomeScreen
import com.webpro.player.ui.live.LiveTvScreen
import com.webpro.player.ui.movies.MoviesScreen
import com.webpro.player.ui.search.SearchScreen
import com.webpro.player.ui.series.SeriesScreen
import com.webpro.player.ui.settings.SettingsScreen
import com.webpro.player.ui.theme.WebProColors

/**
 * Main shell: bottom navigation on phones, navigation rail on tablets and TV.
 * Sections keep their state (and ViewModels) when switching between them.
 */
@Composable
fun MainScreen(navigator: ContentNavigator) {
    val sectionNav = rememberNavController()
    val device = LocalDeviceProfile.current
    val backStack by sectionNav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val openSection: (Section) -> Unit = { section -> sectionNav.openSection(section) }

    if (device.useNavigationRail) {
        Row(
            Modifier
                .fillMaxSize()
                .background(WebProColors.Background)
                .systemBarsPadding()
        ) {
            NavigationRail(
                containerColor = WebProColors.Surface,
                modifier = Modifier.fillMaxHeight(),
                header = {
                    AppLogo(iconSize = 40.dp, showText = false, modifier = Modifier.padding(vertical = 16.dp))
                }
            ) {
                Section.entries.forEach { section ->
                    NavigationRailItem(
                        selected = currentRoute == section.route,
                        onClick = { openSection(section) },
                        icon = { Icon(section.icon, contentDescription = null) },
                        label = {
                            Text(stringResource(section.labelRes), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        },
                        colors = NavigationRailItemDefaults.colors(
                            selectedIconColor = WebProColors.TextPrimary,
                            selectedTextColor = WebProColors.TextPrimary,
                            indicatorColor = WebProColors.Primary,
                            unselectedIconColor = WebProColors.TextSecondary,
                            unselectedTextColor = WebProColors.TextSecondary
                        )
                    )
                    Spacer(Modifier.height(4.dp))
                }
            }
            SectionsNavHost(
                navController = sectionNav,
                navigator = navigator,
                onOpenSection = openSection,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .imePadding()
            )
        }
    } else {
        Scaffold(
            containerColor = WebProColors.Background,
            bottomBar = {
                NavigationBar(containerColor = WebProColors.Surface) {
                    Section.entries.filter { it.inBottomBar }.forEach { section ->
                        NavigationBarItem(
                            selected = currentRoute == section.route,
                            onClick = { openSection(section) },
                            icon = { Icon(section.icon, contentDescription = null) },
                            label = {
                                Text(stringResource(section.labelRes), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = WebProColors.TextPrimary,
                                selectedTextColor = WebProColors.TextPrimary,
                                indicatorColor = WebProColors.Primary,
                                unselectedIconColor = WebProColors.TextSecondary,
                                unselectedTextColor = WebProColors.TextSecondary
                            )
                        )
                    }
                }
            }
        ) { innerPadding ->
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .imePadding()
            ) {
                SectionsNavHost(
                    navController = sectionNav,
                    navigator = navigator,
                    onOpenSection = openSection,
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun SectionsNavHost(
    navController: NavHostController,
    navigator: ContentNavigator,
    onOpenSection: (Section) -> Unit,
    modifier: Modifier
) {
    NavHost(navController = navController, startDestination = Section.HOME.route, modifier = modifier) {
        composable(Section.HOME.route) { HomeScreen(navigator = navigator, onOpenSection = onOpenSection) }
        composable(Section.LIVE.route) { LiveTvScreen(navigator = navigator) }
        composable(Section.MOVIES.route) { MoviesScreen(navigator = navigator) }
        composable(Section.SERIES.route) { SeriesScreen(navigator = navigator) }
        composable(Section.FAVORITES.route) { FavoritesScreen(navigator = navigator) }
        composable(Section.SEARCH.route) { SearchScreen(navigator = navigator) }
        composable(Section.SETTINGS.route) { SettingsScreen(onLoggedOut = { navigator.toLogin() }) }
    }
}

private fun NavHostController.openSection(section: Section) {
    if (currentDestination?.route == section.route) return
    navigate(section.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
