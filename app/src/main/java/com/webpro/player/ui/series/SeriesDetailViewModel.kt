package com.webpro.player.ui.series

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.navigation.Routes
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SeriesDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val repository: XtreamRepository,
    private val favoritesRepository: FavoritesRepository,
    historyRepository: PlaybackHistoryRepository
) : ViewModel() {

    val seriesId: Long = savedStateHandle.get<Long>(Routes.ARG_ID) ?: -1L
    private val favoriteKey = FavoriteItem.keyOf(ContentType.SERIES, seriesId)
    private var loadJob: Job? = null

    private val _state = MutableStateFlow<UiState<SeriesDetails>>(UiState.Loading)
    val state: StateFlow<UiState<SeriesDetails>> = _state.asStateFlow()

    private val _selectedSeason = MutableStateFlow<Int?>(null)
    val selectedSeason: StateFlow<Int?> = _selectedSeason.asStateFlow()

    val isFavorite: StateFlow<Boolean> = favoritesRepository.favoriteKeys()
        .map { favoriteKey in it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val lastWatched: StateFlow<ResumePoint?> = historyRepository.lastEpisodeOfSeries(seriesId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val resumePoints: StateFlow<Map<String, ResumePoint>> = historyRepository.resumePoints
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    init {
        load(forceRefresh = false)
    }

    fun load(forceRefresh: Boolean = true) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.value = UiState.Loading
            _state.value = when (val result = repository.seriesDetails(seriesId, forceRefresh)) {
                is DataResult.Success -> {
                    val details = result.data
                    if (_selectedSeason.value == null || details.seasons.none { it.number == _selectedSeason.value }) {
                        _selectedSeason.value = initialSeason(details)
                    }
                    UiState.Success(details)
                }
                is DataResult.Failure -> UiState.Error(result.error)
            }
        }
    }

    fun selectSeason(number: Int) {
        _selectedSeason.value = number
    }

    /** Episode to start with: the last watched one, or the first of the series. */
    fun continueEpisode(details: SeriesDetails): Episode? {
        val last = lastWatched.value
        val all = details.allEpisodes
        return last?.let { point -> all.firstOrNull { it.id == point.id } } ?: all.firstOrNull()
    }

    fun toggleFavorite() {
        val series = (_state.value as? UiState.Success)?.data?.series ?: return
        viewModelScope.launch {
            favoritesRepository.toggle(
                FavoriteItem(
                    type = ContentType.SERIES,
                    id = series.seriesId,
                    name = series.name,
                    imageUrl = series.coverUrl,
                    categoryId = series.categoryId
                )
            )
        }
    }

    private fun initialSeason(details: SeriesDetails): Int? {
        val lastSeason = lastWatched.value?.season
        return details.seasons.firstOrNull { it.number == lastSeason }?.number ?: details.seasons.firstOrNull()?.number
    }

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                SeriesDetailViewModel(createSavedStateHandle(), c.xtreamRepository, c.favoritesRepository, c.historyRepository)
            }
        }
    }
}
