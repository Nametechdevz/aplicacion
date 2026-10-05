package com.webpro.player.desktop

import com.webpro.player.data.api.HttpClientFactory
import com.webpro.player.data.api.JsonResponseReader
import com.webpro.player.data.api.XtreamApiFactory
import com.webpro.player.data.repository.XtreamRepositoryImpl
import com.webpro.player.desktop.player.DesktopPlayerManager
import com.webpro.player.desktop.player.StreamProbe
import com.webpro.player.desktop.storage.AppDirs
import com.webpro.player.desktop.storage.DesktopSessionRepository
import com.webpro.player.desktop.storage.FileFavoritesRepository
import com.webpro.player.desktop.storage.FileHistoryRepository
import com.webpro.player.desktop.storage.FileSettingsRepository
import com.webpro.player.desktop.storage.SecretCipher
import com.webpro.player.desktop.ui.components.ImageLoader
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.domain.usecase.LoginUseCase
import com.webpro.player.domain.usecase.SearchContentUseCase
import com.webpro.player.domain.usecase.StreamUrlBuilder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.serialization.json.Json

/** Single instances for the whole desktop process. */
class DesktopContainer {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
        prettyPrint = false
    }

    private val httpClient = HttpClientFactory.createApiClient()

    val sessionRepository = DesktopSessionRepository(AppDirs.dataDir, json, SecretCipher.forCurrentPlatform(AppDirs.dataDir))
    val favoritesRepository = FileFavoritesRepository(AppDirs.dataDir, json)
    val historyRepository = FileHistoryRepository(AppDirs.dataDir, json)
    val settingsRepository = FileSettingsRepository(AppDirs.dataDir, json)

    val xtreamRepository: XtreamRepository = XtreamRepositoryImpl(
        apiFactory = XtreamApiFactory(httpClient),
        reader = JsonResponseReader(json),
        credentialsProvider = { sessionRepository.session.value?.credentials }
    )

    val streamUrlBuilder = StreamUrlBuilder()
    val loginUseCase = LoginUseCase(xtreamRepository, sessionRepository)
    val searchUseCase = SearchContentUseCase(xtreamRepository)
    val imageLoader = ImageLoader(httpClient, AppDirs.cacheDir)

    /** The single, app-wide libVLC player. */
    val playerManager = DesktopPlayerManager(settingsRepository, StreamProbe(httpClient))

    fun shutdown() {
        playerManager.shutdown()
    }
}
