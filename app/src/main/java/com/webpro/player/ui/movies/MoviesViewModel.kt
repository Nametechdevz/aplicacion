package com.webpro.player.ui.movies

import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.CatalogSource
import com.webpro.player.ui.common.CatalogViewModel
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

private class MovieSource(private val repository: XtreamRepository) : CatalogSource<Movie> {
    override val favoriteType = ContentType.MOVIE
    override suspend fun categories(forceRefresh: Boolean): DataResult<List<Category>> =
        repository.movieCategories(forceRefresh)
    override suspend fun items(forceRefresh: Boolean): DataResult<List<Movie>> = repository.movies(forceRefresh)
    override fun id(item: Movie) = item.streamId
    override fun name(item: Movie) = item.name
    override fun categoryId(item: Movie) = item.categoryId
    override fun toFavorite(item: Movie) = FavoriteItem(
        type = ContentType.MOVIE,
        id = item.streamId,
        name = item.name,
        imageUrl = item.posterUrl,
        categoryId = item.categoryId,
        containerExtension = item.containerExtension
    )
}

class MoviesViewModel(
    repository: XtreamRepository,
    favoritesRepository: FavoritesRepository,
    historyRepository: PlaybackHistoryRepository
) : CatalogViewModel<Movie>(MovieSource(repository), favoritesRepository) {

    val resumePoints: StateFlow<Map<String, ResumePoint>> = historyRepository.resumePoints
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                MoviesViewModel(c.xtreamRepository, c.favoritesRepository, c.historyRepository)
            }
        }
    }
}
