package com.webpro.player.ui.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class StartDestination { UNDECIDED, MAIN, LOGIN }

/**
 * Restores a remembered session without blocking on the network. Account data is
 * refreshed in the background so a slow server never freezes app start.
 */
class SplashViewModel(
    private val sessionRepository: SessionRepository,
    private val xtreamRepository: XtreamRepository,
    private val appScope: CoroutineScope
) : ViewModel() {

    private val _destination = MutableStateFlow(StartDestination.UNDECIDED)
    val destination: StateFlow<StartDestination> = _destination.asStateFlow()

    init {
        viewModelScope.launch {
            val started = System.currentTimeMillis()
            val restored = runCatching { sessionRepository.restore() }.getOrDefault(false)
            val elapsed = System.currentTimeMillis() - started
            if (elapsed < MIN_SPLASH_MS) delay(MIN_SPLASH_MS - elapsed)
            if (restored) refreshAccountInBackground()
            _destination.value = if (restored) StartDestination.MAIN else StartDestination.LOGIN
        }
    }

    private fun refreshAccountInBackground() {
        val credentials = sessionRepository.session.value?.credentials ?: return
        appScope.launch {
            val result = xtreamRepository.authenticate(credentials)
            if (result is DataResult.Success) sessionRepository.updateAccount(result.data)
        }
    }

    companion object {
        private const val MIN_SPLASH_MS = 700L

        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                SplashViewModel(c.sessionRepository, c.xtreamRepository, c.applicationScope)
            }
        }
    }
}
