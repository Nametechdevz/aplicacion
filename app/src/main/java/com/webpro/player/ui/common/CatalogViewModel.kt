package com.webpro.player.ui.common

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.utils.TextNormalizer
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Where a catalog section gets its data from (live channels, movies or series). */
interface CatalogSource<T> {
    val favoriteType: ContentType
    suspend fun categories(forceRefresh: Boolean): DataResult<List<Category>>
    suspend fun items(forceRefresh: Boolean): DataResult<List<T>>
    fun id(item: T): Long
    fun name(item: T): String
    fun categoryId(item: T): String?
    fun toFavorite(item: T): FavoriteItem
}

/**
 * Shared logic of the catalog sections: one download per list (cached by the
 * repository), category + text filtering on a background dispatcher, favorites.
 */
@OptIn(FlowPreview::class)
open class CatalogViewModel<T>(
    private val source: CatalogSource<T>,
    private val favoritesRepository: FavoritesRepository
) : ViewModel() {

    private val items = MutableStateFlow<List<T>?>(null)
    private val loadError = MutableStateFlow<AppError?>(null)
    private var loadJob: Job? = null

    private val _categories = MutableStateFlow(virtualCategories())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _selectedCategoryId = MutableStateFlow(Category.ALL_ID)
    val selectedCategoryId: StateFlow<String> = _selectedCategoryId.asStateFlow()

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val favoriteKeys: StateFlow<Set<String>> = favoritesRepository.favoriteKeys()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    val state: StateFlow<UiState<List<T>>> = combine(
        items,
        loadError,
        _selectedCategoryId,
        _query.debounce(QUERY_DEBOUNCE_MS),
        favoriteKeys
    ) { list, error, categoryId, query, favorites ->
        filter(list, error, categoryId, query, favorites)
    }
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)

    init {
        load(forceRefresh = false)
    }

    fun load(forceRefresh: Boolean) {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            loadError.value = null
            if (forceRefresh || items.value == null) items.value = null
            coroutineScope {
                val categoriesResult = async { source.categories(forceRefresh) }
                val itemsResult = async { source.items(forceRefresh) }
                when (val result = itemsResult.await()) {
                    is DataResult.Success -> items.value = result.data
                    is DataResult.Failure -> loadError.value = result.error
                }
                categoriesResult.await().getOrNull()?.let { list ->
                    _categories.value = virtualCategories() + list
                }
            }
        }
    }

    fun selectCategory(category: Category) {
        _selectedCategoryId.value = category.id
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun toggleFavorite(item: T) {
        viewModelScope.launch { favoritesRepository.toggle(source.toFavorite(item)) }
    }

    fun isFavorite(item: T, keys: Set<String>): Boolean =
        FavoriteItem.keyOf(source.favoriteType, source.id(item)) in keys

    private fun filter(
        list: List<T>?,
        error: AppError?,
        categoryId: String,
        query: String,
        favorites: Set<String>
    ): UiState<List<T>> {
        if (list == null) return if (error != null) UiState.Error(error) else UiState.Loading
        val normalizedQuery = TextNormalizer.normalize(query)
        val filtered = list.filter { item ->
            val inCategory = when (categoryId) {
                Category.ALL_ID -> true
                Category.FAVORITES_ID -> FavoriteItem.keyOf(source.favoriteType, source.id(item)) in favorites
                else -> source.categoryId(item) == categoryId
            }
            inCategory && (normalizedQuery.isEmpty() ||
                TextNormalizer.matches(TextNormalizer.normalize(source.name(item)), normalizedQuery))
        }
        return if (filtered.isEmpty()) UiState.Empty else UiState.Success(filtered)
    }

    private fun virtualCategories() = listOf(
        Category(Category.ALL_ID, ""),
        Category(Category.FAVORITES_ID, "")
    )

    private companion object {
        const val QUERY_DEBOUNCE_MS = 200L
    }
}
