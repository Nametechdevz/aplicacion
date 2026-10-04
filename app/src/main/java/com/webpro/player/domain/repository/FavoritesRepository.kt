package com.webpro.player.domain.repository

import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import kotlinx.coroutines.flow.Flow

interface FavoritesRepository {
    val favorites: Flow<List<FavoriteItem>>
    fun favoriteKeys(): Flow<Set<String>>
    suspend fun toggle(item: FavoriteItem): Boolean
    suspend fun remove(type: ContentType, id: Long)
    suspend fun clear()
}
