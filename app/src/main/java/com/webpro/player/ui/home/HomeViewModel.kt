package com.webpro.player.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

class HomeViewModel(
    sessionRepository: SessionRepository,
    historyRepository: PlaybackHistoryRepository,
    favoritesRepository: FavoritesRepository
) : ViewModel() {

    val session: StateFlow<Session?> = sessionRepository.session

    /** Movies and episodes in progress, most recent first. */
    val continueWatching: StateFlow<List<ResumePoint>> = historyRepository.resumePoints
        .map { points ->
            points.values
                .filter { it.positionMs > 0 }
                .sortedByDescending { it.updatedAt }
                .take(MAX_CONTINUE)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val favoritesCount: StateFlow<Int> = favoritesRepository.favorites
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    companion object {
        private const val MAX_CONTINUE = 15

        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                HomeViewModel(c.sessionRepository, c.historyRepository, c.favoritesRepository)
            }
        }
    }
}
