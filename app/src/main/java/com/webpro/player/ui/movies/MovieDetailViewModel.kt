package com.webpro.player.ui.movies

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.ResumePoint
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

class MovieDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val repository: XtreamRepository,
    private val favoritesRepository: FavoritesRepository,
    historyRepository: PlaybackHistoryRepository
) : ViewModel() {

    val movieId: Long = savedStateHandle.get<Long>(Routes.ARG_ID) ?: -1L
    private val key = FavoriteItem.keyOf(ContentType.MOVIE, movieId)
    private var loadJob: Job? = null

    private val _state = MutableStateFlow<UiState<MovieDetails>>(UiState.Loading)
    val state: StateFlow<UiState<MovieDetails>> = _state.asStateFlow()

    val isFavorite: StateFlow<Boolean> = favoritesRepository.favoriteKeys()
        .map { key in it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    val resumePoint: StateFlow<ResumePoint?> = historyRepository.resumePoints
        .map { it[ResumePoint.keyOf(ContentType.MOVIE, movieId)] }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.value = UiState.Loading
            _state.value = when (val result = repository.movieDetails(movieId)) {
                is DataResult.Success -> UiState.Success(result.data)
                is DataResult.Failure -> UiState.Error(result.error)
            }
        }
    }

    fun toggleFavorite() {
        val details = (_state.value as? UiState.Success)?.data ?: return
        val movie = details.movie
        viewModelScope.launch {
            favoritesRepository.toggle(
                FavoriteItem(
                    type = ContentType.MOVIE,
                    id = movie.streamId,
                    name = movie.name,
                    imageUrl = movie.posterUrl,
                    categoryId = movie.categoryId,
                    containerExtension = movie.containerExtension
                )
            )
        }
    }

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                MovieDetailViewModel(createSavedStateHandle(), c.xtreamRepository, c.favoritesRepository, c.historyRepository)
            }
        }
    }
}
