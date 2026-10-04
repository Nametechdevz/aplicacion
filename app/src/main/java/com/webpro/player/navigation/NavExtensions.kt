package com.webpro.player.navigation

import androidx.lifecycle.Lifecycle
import androidx.navigation.NavController
import androidx.navigation.NavOptionsBuilder

/**
 * Ignores navigation requests while a transition is running (double click on a
 * channel, repeated DPAD_CENTER...), which prevents duplicated destinations.
 */
fun NavController.navigateSafely(route: String, builder: NavOptionsBuilder.() -> Unit = {}) {
    if (currentBackStackEntry?.lifecycle?.currentState != Lifecycle.State.RESUMED) return
    navigate(route, builder)
}

/** Pops the current destination only if it is the one being shown. */
fun NavController.popSafely(): Boolean {
    if (currentBackStackEntry?.lifecycle?.currentState != Lifecycle.State.RESUMED) return false
    return popBackStack()
}
