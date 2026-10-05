package com.webpro.player.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webpro.player.domain.model.AppSettings
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import com.webpro.player.domain.repository.SettingsRepository
import com.webpro.player.storage.safeData
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

class SettingsRepositoryImpl(private val dataStore: DataStore<Preferences>) : SettingsRepository {

    override val settings: Flow<AppSettings> = dataStore.safeData()
        .map { prefs ->
            AppSettings(
                liveStreamFormat = LiveStreamFormat.fromName(prefs[LIVE_FORMAT]),
                autoPlayNextEpisode = prefs[AUTOPLAY_NEXT] ?: true,
                connectionMode = ConnectionMode.fromName(prefs[CONNECTION_MODE]),
                maxQuality = MaxQuality.fromName(prefs[MAX_QUALITY]),
                learnedProfile = prefs[LEARNED_PROFILE]
            )
        }
        .distinctUntilChanged()

    override suspend fun current(): AppSettings = settings.first()

    override suspend fun setLiveStreamFormat(format: LiveStreamFormat) {
        dataStore.edit { it[LIVE_FORMAT] = format.name }
    }

    override suspend fun setAutoPlayNextEpisode(enabled: Boolean) {
        dataStore.edit { it[AUTOPLAY_NEXT] = enabled }
    }

    override suspend fun setConnectionMode(mode: ConnectionMode) {
        dataStore.edit {
            it[CONNECTION_MODE] = mode.name
            it.remove(LEARNED_PROFILE)
        }
    }

    override suspend fun setMaxQuality(quality: MaxQuality) {
        dataStore.edit { it[MAX_QUALITY] = quality.name }
    }

    override suspend fun setLearnedProfile(profile: String?) {
        dataStore.edit { if (profile == null) it.remove(LEARNED_PROFILE) else it[LEARNED_PROFILE] = profile }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        val LIVE_FORMAT = stringPreferencesKey("live_stream_format")
        val AUTOPLAY_NEXT = booleanPreferencesKey("autoplay_next_episode")
        val CONNECTION_MODE = stringPreferencesKey("connection_mode")
        val MAX_QUALITY = stringPreferencesKey("max_quality")
        val LEARNED_PROFILE = stringPreferencesKey("learned_buffer_profile")
    }
}
