package com.webpro.player.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.storage.safeData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** Stores "continue watching" positions for movies and episodes. */
class PlaybackHistoryRepositoryImpl(
    private val dataStore: DataStore<Preferences>,
    private val json: Json
) : PlaybackHistoryRepository {

    private val serializer = ListSerializer(ResumePoint.serializer())

    override val resumePoints: Flow<Map<String, ResumePoint>> = dataStore.safeData()
        .map { prefs -> decode(prefs[KEY]).associateBy { it.key } }
        .distinctUntilChanged()

    override suspend fun get(type: ContentType, id: Long): ResumePoint? =
        resumePoints.first()[ResumePoint.keyOf(type, id)]

    override suspend fun save(point: ResumePoint) {
        dataStore.edit { prefs ->
            val updated = (listOf(point) + decode(prefs[KEY]).filterNot { it.key == point.key })
                .sortedByDescending { it.updatedAt }
                .take(MAX_ENTRIES)
            prefs[KEY] = json.encodeToString(serializer, updated)
        }
    }

    override suspend fun remove(type: ContentType, id: Long) {
        val key = ResumePoint.keyOf(type, id)
        dataStore.edit { prefs ->
            prefs[KEY] = json.encodeToString(serializer, decode(prefs[KEY]).filterNot { it.key == key })
        }
    }

    override fun lastEpisodeOfSeries(seriesId: Long): Flow<ResumePoint?> = resumePoints
        .map { points ->
            points.values.filter { it.type == ContentType.EPISODE && it.seriesId == seriesId }
                .maxByOrNull { it.updatedAt }
        }
        .distinctUntilChanged()

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private fun decode(raw: String?): List<ResumePoint> =
        raw?.let { runCatching { json.decodeFromString(serializer, it) }.getOrNull() }.orEmpty()

    private companion object {
        val KEY = stringPreferencesKey("resume_points_v1")
        const val MAX_ENTRIES = 300
    }
}
