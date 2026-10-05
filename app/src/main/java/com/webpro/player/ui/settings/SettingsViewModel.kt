package com.webpro.player.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.AppSettings
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.SettingsRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val sessionRepository: SessionRepository,
    private val settingsRepository: SettingsRepository,
    private val favoritesRepository: FavoritesRepository,
    private val historyRepository: PlaybackHistoryRepository,
    private val xtreamRepository: XtreamRepository
) : ViewModel() {

    val session: StateFlow<Session?> = sessionRepository.session

    val settings: StateFlow<AppSettings> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppSettings())

    private val _loggedOut = MutableStateFlow(false)
    val loggedOut: StateFlow<Boolean> = _loggedOut.asStateFlow()

    fun setLiveFormat(format: LiveStreamFormat) {
        viewModelScope.launch { settingsRepository.setLiveStreamFormat(format) }
    }

    fun setConnectionMode(mode: ConnectionMode) {
        viewModelScope.launch { settingsRepository.setConnectionMode(mode) }
    }

    fun setMaxQuality(quality: MaxQuality) {
        viewModelScope.launch { settingsRepository.setMaxQuality(quality) }
    }

    fun setAutoPlayNext(enabled: Boolean) {
        viewModelScope.launch { settingsRepository.setAutoPlayNextEpisode(enabled) }
    }

    /** Ends the session; favorites and preferences are kept. */
    fun logout() {
        viewModelScope.launch {
            sessionRepository.logout()
            xtreamRepository.clearCache()
            _loggedOut.value = true
        }
    }

    /** Removes every stored value: credentials, favorites, history and preferences. */
    fun deleteAllData() {
        viewModelScope.launch {
            sessionRepository.clearAll()
            favoritesRepository.clear()
            historyRepository.clear()
            settingsRepository.clear()
            xtreamRepository.clearCache()
            _loggedOut.value = true
        }
    }

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                SettingsViewModel(
                    c.sessionRepository,
                    c.settingsRepository,
                    c.favoritesRepository,
                    c.historyRepository,
                    c.xtreamRepository
                )
            }
        }
    }
}
