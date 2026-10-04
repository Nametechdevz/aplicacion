package com.webpro.player.domain.repository

import com.webpro.player.domain.model.AppSettings
import com.webpro.player.domain.model.LiveStreamFormat
import kotlinx.coroutines.flow.Flow

interface SettingsRepository {
    val settings: Flow<AppSettings>
    suspend fun current(): AppSettings
    suspend fun setLiveStreamFormat(format: LiveStreamFormat)
    suspend fun setAutoPlayNextEpisode(enabled: Boolean)
    suspend fun clear()
}
