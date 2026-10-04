package com.webpro.player.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.SearchResults
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.usecase.SearchContentUseCase
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** null = the user has not typed enough yet (shows the hint). */
typealias SearchState = UiState<SearchResults>?

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class SearchViewModel(
    private val searchUseCase: SearchContentUseCase,
    private val favoritesRepository: FavoritesRepository
) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val favoriteKeys: StateFlow<Set<String>> = favoritesRepository.favoriteKeys()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    val state: StateFlow<SearchState> = _query
        .map { it.trim() }
        .debounce(DEBOUNCE_MS)
        .distinctUntilChanged()
        .flatMapLatest { text ->
            flow<SearchState> {
                if (text.length < SearchContentUseCase.MIN_QUERY_LENGTH) {
                    emit(null)
                    return@flow
                }
                emit(UiState.Loading)
                val outcome = searchUseCase(text)
                emit(
                    when {
                        outcome.failedSections == SECTIONS -> UiState.Error(AppError.ServerUnreachable)
                        outcome.results.isEmpty -> UiState.Empty
                        else -> UiState.Success(outcome.results)
                    }
                )
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun toggleFavorite(channel: LiveChannel) {
        viewModelScope.launch {
            favoritesRepository.toggle(
                FavoriteItem(
                    type = ContentType.LIVE,
                    id = channel.streamId,
                    name = channel.name,
                    imageUrl = channel.logoUrl,
                    categoryId = channel.categoryId
                )
            )
        }
    }

    companion object {
        private const val DEBOUNCE_MS = 350L
        private const val SECTIONS = 3

        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                SearchViewModel(c.searchUseCase, c.favoritesRepository)
            }
        }
    }
}
