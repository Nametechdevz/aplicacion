package com.webpro.player.di

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import com.webpro.player.data.api.HttpClientFactory
import com.webpro.player.data.api.JsonResponseReader
import com.webpro.player.data.api.XtreamApiFactory
import com.webpro.player.data.repository.FavoritesRepositoryImpl
import com.webpro.player.data.repository.PlaybackHistoryRepositoryImpl
import com.webpro.player.data.repository.SessionRepositoryImpl
import com.webpro.player.data.repository.SettingsRepositoryImpl
import com.webpro.player.data.repository.XtreamRepositoryImpl
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.SettingsRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.domain.usecase.LoginUseCase
import com.webpro.player.domain.usecase.SearchContentUseCase
import com.webpro.player.domain.usecase.StreamUrlBuilder
import com.webpro.player.player.PlayerManager
import com.webpro.player.storage.SecureCipher
import com.webpro.player.storage.favoritesDataStore
import com.webpro.player.storage.historyDataStore
import com.webpro.player.storage.sessionDataStore
import com.webpro.player.storage.settingsDataStore
import com.webpro.player.utils.NetworkMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json

/**
 * Manual dependency container (single instances for the whole process).
 * Kept simple on purpose: no reflection, no annotation processing.
 */
@OptIn(UnstableApi::class)
class AppContainer(context: Context) {
    private val appContext = context.applicationContext

    /** Scope for work that must outlive a screen (e.g. saving progress on exit). */
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    private val apiHttpClient by lazy { HttpClientFactory.createApiClient() }
    private val playerHttpClient by lazy { HttpClientFactory.createPlayerClient(apiHttpClient) }

    val networkMonitor by lazy { NetworkMonitor(appContext) }

    val sessionRepository: SessionRepository by lazy {
        SessionRepositoryImpl(appContext.sessionDataStore, SecureCipher(), json)
    }

    val xtreamRepository: XtreamRepository by lazy {
        XtreamRepositoryImpl(
            apiFactory = XtreamApiFactory(apiHttpClient),
            reader = JsonResponseReader(json),
            credentialsProvider = { sessionRepository.session.value?.credentials }
        )
    }

    val favoritesRepository: FavoritesRepository by lazy {
        FavoritesRepositoryImpl(appContext.favoritesDataStore, json)
    }

    val historyRepository: PlaybackHistoryRepository by lazy {
        PlaybackHistoryRepositoryImpl(appContext.historyDataStore, json)
    }

    val settingsRepository: SettingsRepository by lazy {
        SettingsRepositoryImpl(appContext.settingsDataStore)
    }

    val streamUrlBuilder by lazy { StreamUrlBuilder() }

    val loginUseCase by lazy { LoginUseCase(xtreamRepository, sessionRepository) }

    val searchUseCase by lazy { SearchContentUseCase(xtreamRepository) }

    /** The single, app-wide player. */
    val playerManager by lazy {
        val dataSourceFactory = OkHttpDataSource.Factory(playerHttpClient)
            .setUserAgent(HttpClientFactory.USER_AGENT)
        PlayerManager(appContext, dataSourceFactory, networkMonitor)
    }
}
