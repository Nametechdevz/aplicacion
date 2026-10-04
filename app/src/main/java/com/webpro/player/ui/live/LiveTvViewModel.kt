package com.webpro.player.ui.live

import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.ui.common.CatalogSource
import com.webpro.player.ui.common.CatalogViewModel
import com.webpro.player.ui.common.appContainer

private class LiveSource(private val repository: XtreamRepository) : CatalogSource<LiveChannel> {
    override val favoriteType = ContentType.LIVE
    override suspend fun categories(forceRefresh: Boolean): DataResult<List<Category>> =
        repository.liveCategories(forceRefresh)
    override suspend fun items(forceRefresh: Boolean): DataResult<List<LiveChannel>> =
        repository.liveChannels(forceRefresh)
    override fun id(item: LiveChannel) = item.streamId
    override fun name(item: LiveChannel) = item.name
    override fun categoryId(item: LiveChannel) = item.categoryId
    override fun toFavorite(item: LiveChannel) = FavoriteItem(
        type = ContentType.LIVE,
        id = item.streamId,
        name = item.name,
        imageUrl = item.logoUrl,
        categoryId = item.categoryId
    )
}

class LiveTvViewModel(
    repository: XtreamRepository,
    favoritesRepository: FavoritesRepository
) : CatalogViewModel<LiveChannel>(LiveSource(repository), favoritesRepository) {

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                LiveTvViewModel(c.xtreamRepository, c.favoritesRepository)
            }
        }
    }
}
