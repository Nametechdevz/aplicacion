package com.webpro.player.ui.favorites

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Favorites are read from local storage only: no server requests. */
class FavoritesViewModel(private val favoritesRepository: FavoritesRepository) : ViewModel() {

    private val _selectedType = MutableStateFlow(ContentType.LIVE)
    val selectedType: StateFlow<ContentType> = _selectedType.asStateFlow()

    val counts: StateFlow<Map<ContentType, Int>> = favoritesRepository.favorites
        .combine(_selectedType) { list, _ -> list.groupingBy { it.type }.eachCount() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    val state: StateFlow<UiState<List<FavoriteItem>>> = favoritesRepository.favorites
        .combine(_selectedType) { list, type ->
            val filtered = list.filter { it.type == type }
            if (filtered.isEmpty()) UiState.Empty else UiState.Success(filtered)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    fun select(type: ContentType) {
        _selectedType.value = type
    }

    fun remove(item: FavoriteItem) {
        viewModelScope.launch { favoritesRepository.remove(item.type, item.id) }
    }

    companion object {
        val Factory = viewModelFactory {
            initializer { FavoritesViewModel(appContainer().favoritesRepository) }
        }
    }
}
