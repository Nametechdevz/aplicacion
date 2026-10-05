package com.webpro.player.desktop.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/** Desktop equivalent of a ViewModel: owns a coroutine scope that dies with the screen. */
abstract class ScreenModel {
    protected val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    open fun onDispose() {
        scope.cancel()
    }
}

/** Creates a [ScreenModel] once per [key] and disposes it when it leaves the composition. */
@Composable
fun <T : ScreenModel> rememberScreenModel(vararg key: Any?, factory: () -> T): T {
    val model = remember(*key) { factory() }
    DisposableEffect(model) { onDispose { model.onDispose() } }
    return model
}
