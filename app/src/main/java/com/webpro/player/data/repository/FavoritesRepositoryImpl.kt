package com.webpro.player.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.storage.safeData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** Favorites are stored only on the device; no server requests are needed. */
class FavoritesRepositoryImpl(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
    private val clock: () -> Long = System::currentTimeMillis
) : FavoritesRepository {

    private val serializer = ListSerializer(FavoriteItem.serializer())

    override val favorites: Flow<List<FavoriteItem>> = dataStore.safeData()
        .map { decode(it[KEY]) }
        .distinctUntilChanged()

    override fun favoriteKeys(): Flow<Set<String>> = favorites.map { list -> list.mapTo(HashSet()) { it.key } }

    override suspend fun toggle(item: FavoriteItem): Boolean {
        var added = false
        dataStore.edit { prefs ->
            val current = decode(prefs[KEY])
            val updated = if (current.any { it.key == item.key }) {
                current.filterNot { it.key == item.key }
            } else {
                added = true
                listOf(item.copy(addedAt = clock())) + current
            }
            prefs[KEY] = json.encodeToString(serializer, updated)
        }
        return added
    }

    override suspend fun remove(type: ContentType, id: Long) {
        val key = FavoriteItem.keyOf(type, id)
        dataStore.edit { prefs ->
            prefs[KEY] = json.encodeToString(serializer, decode(prefs[KEY]).filterNot { it.key == key })
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private fun decode(raw: String?): List<FavoriteItem> =
        raw?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }.orEmpty()

    private companion object {
        val KEY = stringPreferencesKey("favorites_v1")
    }
}
