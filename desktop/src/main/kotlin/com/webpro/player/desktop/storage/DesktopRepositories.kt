package com.webpro.player.desktop.storage

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.AppSettings
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.LoginPrefill
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.SettingsRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class StoredSession(
    val serverUrl: String? = null,
    val username: String? = null,
    val encryptedPassword: String? = null,
    val remember: Boolean = true,
    val account: AccountInfo? = null
)

/** Session persisted in session.json; the password is protected by [SecretCipher]. */
class DesktopSessionRepository(dir: File, json: Json, private val cipher: SecretCipher) : SessionRepository {
    private val store = JsonFileStore(File(dir, "session.json"), StoredSession.serializer(), json, StoredSession())
    private val _session = MutableStateFlow<Session?>(null)
    override val session: StateFlow<Session?> = _session.asStateFlow()

    override suspend fun restore(): Boolean {
        _session.value?.let { return true }
        val stored = store.data.value
        if (!stored.remember) return false
        val server = stored.serverUrl ?: return false
        val user = stored.username ?: return false
        val password = stored.encryptedPassword?.let(cipher::decrypt) ?: return false
        _session.value = Session(Credentials(server, user, password), stored.account, remember = true)
        return true
    }

    override suspend fun saveSession(session: Session) {
        _session.value = session
        store.update {
            if (session.remember) {
                StoredSession(
                    serverUrl = session.credentials.serverUrl,
                    username = session.credentials.username,
                    encryptedPassword = cipher.encrypt(session.credentials.password),
                    remember = true,
                    account = session.account
                )
            } else {
                StoredSession(remember = false)
            }
        }
    }

    override suspend fun updateAccount(account: AccountInfo) {
        val current = _session.value ?: return
        _session.value = current.copy(account = account)
        if (current.remember) store.update { it.copy(account = account) }
    }

    override suspend fun loginPrefill(): LoginPrefill? {
        val stored = store.data.value
        val server = stored.serverUrl ?: return null
        return LoginPrefill(server, stored.username.orEmpty(), stored.remember)
    }

    override suspend fun logout() {
        _session.value = null
        store.update { it.copy(encryptedPassword = null, account = null) }
    }

    override suspend fun clearAll() {
        _session.value = null
        store.clear()
    }
}

class FileFavoritesRepository(dir: File, json: Json, private val clock: () -> Long = System::currentTimeMillis) :
    FavoritesRepository {
    private val store = JsonFileStore(
        File(dir, "favorites.json"), ListSerializer(FavoriteItem.serializer()), json, emptyList()
    )

    override val favorites: Flow<List<FavoriteItem>> = store.data

    override fun favoriteKeys(): Flow<Set<String>> =
        store.data.map { list -> list.mapTo(HashSet()) { it.key } }.distinctUntilChanged()

    override suspend fun toggle(item: FavoriteItem): Boolean {
        var added = false
        store.update { current ->
            if (current.any { it.key == item.key }) current.filterNot { it.key == item.key }
            else {
                added = true
                listOf(item.copy(addedAt = clock())) + current
            }
        }
        return added
    }

    override suspend fun remove(type: ContentType, id: Long) {
        val key = FavoriteItem.keyOf(type, id)
        store.update { list -> list.filterNot { it.key == key } }
    }

    override suspend fun clear() = store.clear()
}

class FileHistoryRepository(dir: File, json: Json) : PlaybackHistoryRepository {
    private val store = JsonFileStore(
        File(dir, "history.json"), ListSerializer(ResumePoint.serializer()), json, emptyList()
    )

    override val resumePoints: Flow<Map<String, ResumePoint>> =
        store.data.map { list -> list.associateBy { it.key } }.distinctUntilChanged()

    override suspend fun get(type: ContentType, id: Long): ResumePoint? =
        store.data.value.firstOrNull { it.key == ResumePoint.keyOf(type, id) }

    override suspend fun save(point: ResumePoint) {
        store.update { list ->
            (listOf(point) + list.filterNot { it.key == point.key })
                .sortedByDescending { it.updatedAt }
                .take(MAX_ENTRIES)
        }
    }

    override suspend fun remove(type: ContentType, id: Long) {
        val key = ResumePoint.keyOf(type, id)
        store.update { list -> list.filterNot { it.key == key } }
    }

    override fun lastEpisodeOfSeries(seriesId: Long): Flow<ResumePoint?> = store.data
        .map { list -> list.filter { it.type == ContentType.EPISODE && it.seriesId == seriesId }.maxByOrNull { it.updatedAt } }
        .distinctUntilChanged()

    override suspend fun clear() = store.clear()

    private companion object {
        const val MAX_ENTRIES = 300
    }
}

@Serializable
data class DesktopSettings(
    val liveStreamFormat: LiveStreamFormat = LiveStreamFormat.TS,
    val autoPlayNextEpisode: Boolean = true,
    val volume: Int = 100,
    val hardwareDecoding: Boolean = true,
    val connectionMode: ConnectionMode = ConnectionMode.AUTO,
    val maxQuality: MaxQuality = MaxQuality.AUTO,
    /** Buffer level learned automatically on a slow connection (AUTO mode). */
    val learnedProfile: String? = null
) {
    fun toAppSettings() = AppSettings(liveStreamFormat, autoPlayNextEpisode, connectionMode, maxQuality, learnedProfile)
}

/** App settings plus desktop playback preferences (volume, hardware decoding). */
class FileSettingsRepository(dir: File, json: Json) : SettingsRepository {
    private val store = JsonFileStore(File(dir, "settings.json"), DesktopSettings.serializer(), json, DesktopSettings())

    val desktopSettings: StateFlow<DesktopSettings> = store.data

    override val settings: Flow<AppSettings> = store.data
        .map { it.toAppSettings() }
        .distinctUntilChanged()

    override suspend fun current(): AppSettings =
        store.data.value.toAppSettings()

    override suspend fun setLiveStreamFormat(format: LiveStreamFormat) {
        store.update { it.copy(liveStreamFormat = format) }
    }

    override suspend fun setAutoPlayNextEpisode(enabled: Boolean) {
        store.update { it.copy(autoPlayNextEpisode = enabled) }
    }

    suspend fun setVolume(volume: Int) {
        store.update { it.copy(volume = volume.coerceIn(0, MAX_VOLUME)) }
    }

    suspend fun setHardwareDecoding(enabled: Boolean) {
        store.update { it.copy(hardwareDecoding = enabled) }
    }

    override suspend fun setConnectionMode(mode: ConnectionMode) {
        // A manual choice (or going back to automatic) starts learning from scratch.
        store.update { it.copy(connectionMode = mode, learnedProfile = null) }
    }

    override suspend fun setMaxQuality(quality: MaxQuality) {
        store.update { it.copy(maxQuality = quality) }
    }

    override suspend fun setLearnedProfile(profile: String?) {
        store.update { it.copy(learnedProfile = profile) }
    }

    override suspend fun clear() = store.clear()

    companion object {
        const val MAX_VOLUME = 150
    }
}
