package com.webpro.player.player

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.FavoritesRepository
import com.webpro.player.domain.repository.PlaybackHistoryRepository
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.SettingsRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.domain.usecase.StreamUrlBuilder
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID

data class PlayerUiState(
    val type: ContentType,
    val title: String,
    val subtitle: String? = null,
    val isResolving: Boolean = true,
    val resolveError: AppError? = null,
    val channels: List<LiveChannel> = emptyList(),
    val currentChannelId: Long? = null,
    val zappingChannel: LiveChannel? = null,
    val hasNextEpisode: Boolean = false,
    val hasPreviousEpisode: Boolean = false,
    val resumedFromMs: Long? = null
) {
    val isLive: Boolean get() = type == ContentType.LIVE
}

/**
 * Resolves what to play from the navigation arguments and drives the shared
 * [PlayerManager]: channel zapping (debounced), next/previous episode, resume points
 * and lifecycle (stop/start/clear).
 */
class PlayerViewModel(
    savedStateHandle: SavedStateHandle,
    private val playerManager: PlayerManager,
    private val xtreamRepository: XtreamRepository,
    private val sessionRepository: SessionRepository,
    private val settingsRepository: SettingsRepository,
    private val historyRepository: PlaybackHistoryRepository,
    private val favoritesRepository: FavoritesRepository,
    private val urlBuilder: StreamUrlBuilder,
    private val appScope: CoroutineScope
) : ViewModel() {

    private val args = PlayerArgs.from(savedStateHandle)
    private val ownerId = UUID.randomUUID().toString()

    val playerState: StateFlow<PlayerState> = playerManager.state
    val player = playerManager.player

    private val _ui = MutableStateFlow(PlayerUiState(type = args.type, title = args.title))
    val ui: StateFlow<PlayerUiState> = _ui.asStateFlow()

    private var episodes: List<Episode> = emptyList()
    private var seriesName: String? = null
    private var currentEpisode: Episode? = null
    private var hostStarted = false
    private var pendingRequest: PlaybackRequest? = null
    private var activeRequest: PlaybackRequest? = null
    private var zapJob: Job? = null
    private var resolveJob: Job? = null
    private var endedHandledFor: String? = null

    init {
        resolve()
        viewModelScope.launch {
            playerManager.state.collect { state -> onPlayerStateChanged(state) }
        }
        viewModelScope.launch {
            while (isActive) {
                delay(PROGRESS_SAVE_INTERVAL_MS)
                if (playerState.value.isPlaying) saveProgress()
            }
        }
    }

    fun resolve() {
        resolveJob?.cancel()
        resolveJob = viewModelScope.launch {
            _ui.update { it.copy(isResolving = true, resolveError = null) }
            val session = sessionRepository.session.value
            if (session == null) {
                _ui.update { it.copy(isResolving = false, resolveError = AppError.NotLoggedIn) }
                return@launch
            }
            when (args.type) {
                ContentType.LIVE -> resolveLive()
                ContentType.MOVIE -> resolveMovie(session)
                ContentType.EPISODE -> resolveEpisode()
                ContentType.SERIES -> _ui.update { it.copy(isResolving = false, resolveError = AppError.NotFound) }
            }
        }
    }

    // ---------------------------------------------------------------- live

    private suspend fun resolveLive() {
        val all = xtreamRepository.liveChannels().getOrNull().orEmpty()
        val categoryId = args.categoryId
        val inCategory = when (categoryId) {
            null, Category.ALL_ID -> all
            Category.FAVORITES_ID -> {
                val keys = favoritesRepository.favorites.first()
                    .filter { it.type == ContentType.LIVE }
                    .mapTo(HashSet()) { it.id }
                all.filter { it.streamId in keys }
            }
            else -> all.filter { it.categoryId == categoryId }
        }
        val list = if (inCategory.any { it.streamId == args.id }) inCategory else all
        val channel = list.firstOrNull { it.streamId == args.id }
            ?: LiveChannel(args.id, 0, args.title, null, categoryId, null, false)
        _ui.update { it.copy(channels = list) }
        playChannel(channel)
    }

    /** Debounced channel change: the overlay updates at once, playback after a short pause. */
    fun zap(offset: Int) {
        val channels = _ui.value.channels
        if (channels.isEmpty()) return
        val baseId = _ui.value.zappingChannel?.streamId ?: _ui.value.currentChannelId
        val index = channels.indexOfFirst { it.streamId == baseId }.coerceAtLeast(0)
        val target = channels[(index + offset).mod(channels.size)]
        _ui.update { it.copy(zappingChannel = target) }
        zapJob?.cancel()
        zapJob = viewModelScope.launch {
            delay(ZAP_DEBOUNCE_MS)
            playChannel(target)
        }
    }

    fun selectChannel(channel: LiveChannel) {
        zapJob?.cancel()
        if (channel.streamId == _ui.value.currentChannelId && playerState.value.status != PlaybackStatus.ERROR) {
            _ui.update { it.copy(zappingChannel = null) }
            return
        }
        zapJob = viewModelScope.launch { playChannel(channel) }
    }

    private suspend fun playChannel(channel: LiveChannel) {
        val session = sessionRepository.session.value ?: return
        val settings = settingsRepository.current()
        val sources = urlBuilder.live(
            session.credentials,
            channel.streamId,
            settings.liveStreamFormat,
            session.account?.allowedOutputFormats.orEmpty()
        )
        if (sources.isEmpty()) {
            _ui.update { it.copy(isResolving = false, resolveError = AppError.InvalidUrl) }
            return
        }
        _ui.update {
            it.copy(
                title = channel.name,
                subtitle = if (channel.number > 0) "Canal ${channel.number}" else null,
                currentChannelId = channel.streamId,
                zappingChannel = null,
                isResolving = false,
                resolveError = null
            )
        }
        startPlayback(
            PlaybackRequest(
                type = ContentType.LIVE,
                contentId = channel.streamId,
                title = channel.name,
                artworkUrl = channel.logoUrl,
                sources = sources
            )
        )
    }

    // ---------------------------------------------------------------- movies

    private suspend fun resolveMovie(session: Session) {
        var extension = args.extension ?: xtreamRepository.cachedMovie(args.id)?.containerExtension
        var title = args.title
        if (extension == null || title.isBlank()) {
            xtreamRepository.movieDetails(args.id).getOrNull()?.let { details ->
                extension = extension ?: details.movie.containerExtension
                if (title.isBlank()) title = details.movie.name
            }
        }
        val source = urlBuilder.movie(session.credentials, args.id, extension)
        if (source == null) {
            _ui.update { it.copy(isResolving = false, resolveError = AppError.InvalidUrl) }
            return
        }
        val start = resumePosition(ContentType.MOVIE, args.id, args.resume)
        _ui.update { it.copy(title = title, isResolving = false, resumedFromMs = start.takeIf { p -> p > 0 }) }
        startPlayback(
            PlaybackRequest(
                type = ContentType.MOVIE,
                contentId = args.id,
                title = title,
                artworkUrl = xtreamRepository.cachedMovie(args.id)?.posterUrl,
                sources = listOf(source),
                startPositionMs = start
            )
        )
    }

    // ---------------------------------------------------------------- episodes

    private suspend fun resolveEpisode() {
        val seriesId = args.seriesId
        val details = seriesId?.let { xtreamRepository.seriesDetails(it).getOrNull() }
        seriesName = details?.series?.name
        episodes = details?.allEpisodes.orEmpty()
        val episode = episodes.firstOrNull { it.id == args.id } ?: Episode(
            id = args.id,
            seriesId = seriesId ?: 0L,
            season = 0,
            episodeNumber = 0,
            title = args.title,
            containerExtension = args.extension,
            plot = null,
            durationSeconds = null,
            durationLabel = null,
            imageUrl = null
        )
        playEpisode(episode, args.resume)
    }

    fun nextEpisode() = moveEpisode(+1)

    fun previousEpisode() = moveEpisode(-1)

    private fun moveEpisode(offset: Int) {
        val current = currentEpisode ?: return
        val index = episodes.indexOfFirst { it.id == current.id }
        val target = episodes.getOrNull(index + offset) ?: return
        saveProgress()
        viewModelScope.launch { playEpisode(target, resume = true) }
    }

    private suspend fun playEpisode(episode: Episode, resume: Boolean) {
        val session = sessionRepository.session.value ?: return
        val source = urlBuilder.episode(session.credentials, episode.id, episode.containerExtension ?: args.extension)
        if (source == null) {
            _ui.update { it.copy(isResolving = false, resolveError = AppError.InvalidUrl) }
            return
        }
        currentEpisode = episode
        val index = episodes.indexOfFirst { it.id == episode.id }
        val label = if (episode.season > 0) "T${episode.season} · E${episode.episodeNumber}" else null
        val subtitle = listOfNotNull(seriesName, label).joinToString(" · ").ifBlank { null }
        val start = resumePosition(ContentType.EPISODE, episode.id, resume)
        _ui.update {
            it.copy(
                title = episode.title,
                subtitle = subtitle,
                isResolving = false,
                resolveError = null,
                hasNextEpisode = index >= 0 && index < episodes.lastIndex,
                hasPreviousEpisode = index > 0,
                resumedFromMs = start.takeIf { p -> p > 0 }
            )
        }
        startPlayback(
            PlaybackRequest(
                type = ContentType.EPISODE,
                contentId = episode.id,
                title = episode.title,
                subtitle = subtitle,
                artworkUrl = episode.imageUrl,
                sources = listOf(source),
                startPositionMs = start
            )
        )
    }

    // ---------------------------------------------------------------- playback

    private fun startPlayback(request: PlaybackRequest) {
        activeRequest = request
        endedHandledFor = null
        if (hostStarted) {
            pendingRequest = null
            playerManager.play(ownerId, request)
        } else {
            pendingRequest = request
        }
    }

    private suspend fun resumePosition(type: ContentType, id: Long, resume: Boolean): Long {
        if (!resume) return 0L
        val point = historyRepository.get(type, id) ?: return 0L
        val finished = point.durationMs > 0 && point.positionMs >= point.durationMs * FINISHED_RATIO
        return if (point.positionMs >= MIN_RESUME_MS && !finished) point.positionMs else 0L
    }

    private fun onPlayerStateChanged(state: PlayerState) {
        val request = state.request ?: return
        if (!playerManager.isOwnedBy(ownerId) || state.status != PlaybackStatus.ENDED) return
        if (endedHandledFor == request.contentKey) return
        endedHandledFor = request.contentKey
        if (request.isLive) return
        appScope.launch { historyRepository.remove(request.type, request.contentId) }
        if (request.type == ContentType.EPISODE && _ui.value.hasNextEpisode) {
            viewModelScope.launch {
                if (settingsRepository.current().autoPlayNextEpisode) nextEpisode()
            }
        }
    }

    fun retry() {
        val state = playerState.value
        if (state.request != null && playerManager.isOwnedBy(ownerId)) playerManager.retry(ownerId)
        else resolve()
    }

    fun togglePlayPause() = playerManager.togglePlayPause()
    fun seekBy(deltaMs: Long) = playerManager.seekBy(deltaMs)
    fun seekTo(positionMs: Long) = playerManager.seekTo(positionMs)
    fun toggleMute() = playerManager.toggleMute()

    fun onHostStart() {
        hostStarted = true
        val pending = pendingRequest
        if (pending != null) {
            pendingRequest = null
            playerManager.play(ownerId, pending)
        } else {
            playerManager.onHostStarted(ownerId)
        }
    }

    fun onHostStop() {
        hostStarted = false
        saveProgress()
        playerManager.onHostStopped(ownerId)
    }

    private fun saveProgress() {
        if (!playerManager.isOwnedBy(ownerId)) return
        val request = playerState.value.request ?: return
        if (request.isLive || request.contentKey != activeRequest?.contentKey) return
        val position = playerManager.currentPositionMs()
        val duration = playerState.value.durationMs
        if (position < MIN_RESUME_MS) return
        val episode = currentEpisode?.takeIf { request.type == ContentType.EPISODE && it.id == request.contentId }
        val point = ResumePoint(
            type = request.type,
            id = request.contentId,
            positionMs = position,
            durationMs = duration,
            updatedAt = System.currentTimeMillis(),
            seriesId = episode?.seriesId,
            season = episode?.season,
            episodeNumber = episode?.episodeNumber,
            title = request.title,
            imageUrl = request.artworkUrl
        )
        appScope.launch {
            if (duration > 0 && position >= duration * FINISHED_RATIO) {
                historyRepository.remove(request.type, request.contentId)
            } else {
                historyRepository.save(point)
            }
        }
    }

    override fun onCleared() {
        zapJob?.cancel()
        saveProgress()
        playerManager.release(ownerId)
        super.onCleared()
    }

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                PlayerViewModel(
                    savedStateHandle = createSavedStateHandle(),
                    playerManager = c.playerManager,
                    xtreamRepository = c.xtreamRepository,
                    sessionRepository = c.sessionRepository,
                    settingsRepository = c.settingsRepository,
                    historyRepository = c.historyRepository,
                    favoritesRepository = c.favoritesRepository,
                    urlBuilder = c.streamUrlBuilder,
                    appScope = c.applicationScope
                )
            }
        }

        private const val ZAP_DEBOUNCE_MS = 450L
        private const val PROGRESS_SAVE_INTERVAL_MS = 10_000L
        private const val MIN_RESUME_MS = 10_000L
        private const val FINISHED_RATIO = 0.95
    }
}
