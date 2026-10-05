package com.webpro.player.domain.repository

import com.webpro.player.domain.model.AppSettings
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import kotlinx.coroutines.flow.Flow

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun current(): AppSettings
    suspend fun setLiveStreamFormat(format: LiveStreamFormat)
    suspend fun setAutoPlayNextEpisode(enabled: Boolean)
    suspend fun setConnectionMode(mode: ConnectionMode)
    suspend fun setMaxQuality(quality: MaxQuality)

    /** Buffer level learned in AUTO mode (BufferProfile name), reused on next playback. */
    suspend fun setLearnedProfile(profile: String?)
    suspend fun clear()
}
