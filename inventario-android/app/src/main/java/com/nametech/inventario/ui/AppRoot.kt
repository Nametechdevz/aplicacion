package com.nametech.inventario.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Badge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.screens.ClientDetailScreen
import com.nametech.inventario.ui.screens.ClientEditScreen
import com.nametech.inventario.ui.screens.ClientsScreen
import com.nametech.inventario.ui.screens.DashboardScreen
import com.nametech.inventario.ui.screens.InventoryScreen
import com.nametech.inventario.ui.screens.ItemDetailScreen
import com.nametech.inventario.ui.screens.ItemEditScreen
import com.nametech.inventario.ui.screens.LockScreen
import com.nametech.inventario.ui.screens.RemindersScreen
import com.nametech.inventario.ui.screens.SellScreen
import com.nametech.inventario.ui.screens.SettingsScreen

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab("dashboard", "Inicio", Icons.Filled.Dashboard),
    Tab("inventory", "Inventario", Icons.Filled.Inventory2),
    Tab("clients", "Clientes", Icons.Filled.People),
    Tab("reminders", "Avisos", Icons.Filled.NotificationsActive),
    Tab("settings", "Ajustes", Icons.Filled.Settings),
)

/** Acciones de navegación que comparten las pantallas. */
class Nav(private val nav: NavHostController) {
    fun back() = nav.popBackStack()
    fun tab(route: String) = nav.navigate(route) {
        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    fun item(id: Long) = nav.navigate("item/$id")
    fun editItem(id: Long = 0) = nav.navigate("item_edit?id=$id")
    fun sell(id: Long) = nav.navigate("sell/$id")
    fun client(id: Long) = nav.navigate("client/$id")
    fun editClient(id: Long = 0) = nav.navigate("client_edit?id=$id")
}

@Composable
fun AppRoot(vm: AppViewModel, openRequest: MutableState<String?>) {
    if (vm.locked) {
        Surface(Modifier.fillMaxSize()) { LockScreen(vm) }
        return
    }
    val navController = rememberNavController()
    val nav = remember(navController) { Nav(navController) }
    val backStack by navController.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val items by vm.items.collectAsState()
    val settings by vm.settings.collectAsState()
    val today by vm.today.collectAsState()

    LaunchedEffect(openRequest.value) {
        openRequest.value?.let {
            nav.tab(it)
            openRequest.value = null
        }
    }

    val alerts = items.orEmpty().count {
        it.status == ItemStatus.SOLD && it.timeState(today, settings.dueSoonDays).let { s -> s == TimeState.DUE_SOON || s == TimeState.EXPIRED }
    }

    Scaffold(
        bottomBar = {
            if (tabs.any { it.route == route }) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = { nav.tab(tab.route) },
                            icon = {
                                if (tab.route == "reminders" && alerts > 0) {
                                    BadgedBox(badge = { Badge { Text(alerts.toString()) } }) { Icon(tab.icon, contentDescription = tab.label) }
                                } else {
                                    Icon(tab.icon, contentDescription = tab.label)
                                }
                            },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(navController, startDestination = "dashboard", modifier = Modifier.padding(bottom = padding.calculateBottomPadding())) {
            composable("dashboard") { DashboardScreen(vm, nav) }
            composable("inventory") { InventoryScreen(vm, nav) }
            composable("clients") { ClientsScreen(vm, nav) }
            composable("reminders") { RemindersScreen(vm, nav) }
            composable("settings") { SettingsScreen(vm) }
            composable("item/{id}", arguments = listOf(navArgument("id") { type = NavType.LongType })) {
                ItemDetailScreen(vm, nav, it.arguments!!.getLong("id"))
            }
            composable(
                "item_edit?id={id}",
                arguments = listOf(navArgument("id") { type = NavType.LongType; defaultValue = 0L }),
            ) { ItemEditScreen(vm, nav, it.arguments!!.getLong("id")) }
            composable("sell/{id}", arguments = listOf(navArgument("id") { type = NavType.LongType })) {
                SellScreen(vm, nav, it.arguments!!.getLong("id"))
            }
            composable("client/{id}", arguments = listOf(navArgument("id") { type = NavType.LongType })) {
                ClientDetailScreen(vm, nav, it.arguments!!.getLong("id"))
            }
            composable(
                "client_edit?id={id}",
                arguments = listOf(navArgument("id") { type = NavType.LongType; defaultValue = 0L }),
            ) { ClientEditScreen(vm, nav, it.arguments!!.getLong("id")) }
        }
    }
}
