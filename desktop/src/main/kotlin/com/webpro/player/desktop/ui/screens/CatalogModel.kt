package com.webpro.player.desktop.ui.screens

import com.webpro.player.desktop.ui.ScreenModel
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.UiState
import com.webpro.player.utils.TextNormalizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
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

interface CatalogSource<T> {
    val favoriteType: ContentType
    suspend fun categories(force: Boolean): DataResult<List<Category>>
    suspend fun items(force: Boolean): DataResult<List<T>>
    fun id(item: T): Long
    fun name(item: T): String
    fun categoryId(item: T): String?
    fun toFavorite(item: T): FavoriteItem
}

/** Category + text filtering off the UI thread; lists come from the shared repository cache. */
@OptIn(FlowPreview::class)
class CatalogModel<T>(private val source: CatalogSource<T>, private val favorites: FavoritesRepository) : ScreenModel() {

    private val items = MutableStateFlow<List<T>?>(null)
    private val loadError = MutableStateFlow<AppError?>(null)
    private var loadJob: Job? = null

    private val _categories = MutableStateFlow(virtualCategories())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()
    private val _selected = MutableStateFlow(Category.ALL_ID)
    val selectedCategoryId: StateFlow<String> = _selected.asStateFlow()
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val favoriteKeys: StateFlow<Set<String>> = favorites.favoriteKeys().stateIn(scope, SharingStarted.Eagerly, emptySet())

    val state: StateFlow<UiState<List<T>>> = combine(items, loadError, _selected, _query.debounce(180), favoriteKeys) {
            list, error, category, query, favs -> filter(list, error, category, query, favs)
        }
        .flowOn(Dispatchers.Default)
        .stateIn(scope, SharingStarted.Eagerly, UiState.Loading)

    init {
        load(false)
    }

    fun load(force: Boolean) {
        loadJob?.cancel()
        loadJob = scope.launch {
            loadError.value = null
            if (force) items.value = null
            coroutineScope {
                val categories = async { source.categories(force) }
                when (val result = source.items(force)) {
                    is DataResult.Success -> items.value = result.data
                    is DataResult.Failure -> loadError.value = result.error
                }
                categories.await().getOrNull()?.let { _categories.value = virtualCategories() + it }
            }
        }
    }

    fun selectCategory(category: Category) {
        _selected.value = category.id
    }

    fun onQueryChange(value: String) {
        _query.value = value
    }

    fun toggleFavorite(item: T) {
        scope.launch { favorites.toggle(source.toFavorite(item)) }
    }

    fun isFavorite(item: T, keys: Set<String>) = FavoriteItem.keyOf(source.favoriteType, source.id(item)) in keys

    private fun filter(list: List<T>?, error: AppError?, category: String, query: String, favs: Set<String>): UiState<List<T>> {
        if (list == null) return if (error != null) UiState.Error(error) else UiState.Loading
        val q = TextNormalizer.normalize(query)
        val filtered = list.filter { item ->
            val inCategory = when (category) {
                Category.ALL_ID -> true
                Category.FAVORITES_ID -> FavoriteItem.keyOf(source.favoriteType, source.id(item)) in favs
                else -> source.categoryId(item) == category
            }
            inCategory && (q.isEmpty() || TextNormalizer.matches(TextNormalizer.normalize(source.name(item)), q))
        }
        return if (filtered.isEmpty()) UiState.Empty else UiState.Success(filtered)
    }

    private fun virtualCategories() = listOf(Category(Category.ALL_ID, ""), Category(Category.FAVORITES_ID, ""))
}

class LiveSource(private val repo: XtreamRepository) : CatalogSource<LiveChannel> {
    override val favoriteType = ContentType.LIVE
    override suspend fun categories(force: Boolean) = repo.liveCategories(force)
    override suspend fun items(force: Boolean) = repo.liveChannels(force)
    override fun id(item: LiveChannel) = item.streamId
    override fun name(item: LiveChannel) = item.name
    override fun categoryId(item: LiveChannel) = item.categoryId
    override fun toFavorite(item: LiveChannel) =
        FavoriteItem(ContentType.LIVE, item.streamId, item.name, item.logoUrl, item.categoryId)
}

class MovieSource(private val repo: XtreamRepository) : CatalogSource<Movie> {
    override val favoriteType = ContentType.MOVIE
    override suspend fun categories(force: Boolean) = repo.movieCategories(force)
    override suspend fun items(force: Boolean) = repo.movies(force)
    override fun id(item: Movie) = item.streamId
    override fun name(item: Movie) = item.name
    override fun categoryId(item: Movie) = item.categoryId
    override fun toFavorite(item: Movie) =
        FavoriteItem(ContentType.MOVIE, item.streamId, item.name, item.posterUrl, item.categoryId, item.containerExtension)
}

class SeriesSource(private val repo: XtreamRepository) : CatalogSource<Series> {
    override val favoriteType = ContentType.SERIES
    override suspend fun categories(force: Boolean) = repo.seriesCategories(force)
    override suspend fun items(force: Boolean) = repo.series(force)
    override fun id(item: Series) = item.seriesId
    override fun name(item: Series) = item.name
    override fun categoryId(item: Series) = item.categoryId
    override fun toFavorite(item: Series) =
        FavoriteItem(ContentType.SERIES, item.seriesId, item.name, item.coverUrl, item.categoryId)
}
