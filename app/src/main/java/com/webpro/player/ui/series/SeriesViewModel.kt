package com.webpro.player.ui.series

import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.CatalogSource
import com.webpro.player.ui.common.CatalogViewModel
import com.webpro.player.ui.common.appContainer

private class SeriesSource(private val repository: XtreamRepository) : CatalogSource<Series> {
    override val favoriteType = ContentType.SERIES
    override suspend fun categories(forceRefresh: Boolean): DataResult<List<Category>> =
        repository.seriesCategories(forceRefresh)
    override suspend fun items(forceRefresh: Boolean): DataResult<List<Series>> = repository.series(forceRefresh)
    override fun id(item: Series) = item.seriesId
    override fun name(item: Series) = item.name
    override fun categoryId(item: Series) = item.categoryId
    override fun toFavorite(item: Series) = FavoriteItem(
        type = ContentType.SERIES,
        id = item.seriesId,
        name = item.name,
        imageUrl = item.coverUrl,
        categoryId = item.categoryId
    )
}

class SeriesViewModel(
    repository: XtreamRepository,
    favoritesRepository: FavoritesRepository
) : CatalogViewModel<Series>(SeriesSource(repository), favoritesRepository) {

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                SeriesViewModel(c.xtreamRepository, c.favoritesRepository)
            }
        }
    }
}
