package com.webpro.player.desktop.ui.screens

import com.webpro.player.desktop.DesktopContainer
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.ScreenModel
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.player.PlaybackRequest
import com.webpro.player.player.PlaybackStatus
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

/** Resolves what to play and drives the shared [com.webpro.player.desktop.player.DesktopPlayerManager]. */
class PlayerModel(private val c: DesktopContainer, private val target: PlayerTarget) : ScreenModel() {

    private val ownerId = UUID.randomUUID().toString()
    private val manager = c.playerManager
    val playerState = manager.state

    private val _ui = MutableStateFlow(PlayerUiState(type = target.type, title = target.title))
    val ui: StateFlow<PlayerUiState> = _ui.asStateFlow()

    private var episodes: List<Episode> = emptyList()
    private var seriesName: String? = null
    private var currentEpisode: Episode? = null
    private var activeRequest: PlaybackRequest? = null
    private var zapJob: Job? = null
    private var endedHandledFor: String? = null

    init {
        resolve()
        scope.launch {
            manager.state.collect { state ->
                val request = state.request ?: return@collect
                if (!manager.isOwnedBy(ownerId) || state.status != PlaybackStatus.ENDED) return@collect
                if (endedHandledFor == request.contentKey) return@collect
                endedHandledFor = request.contentKey
                if (request.isLive) return@collect
                c.applicationScope.launch { c.historyRepository.remove(request.type, request.contentId) }
                if (request.type == ContentType.EPISODE && _ui.value.hasNextEpisode && c.settingsRepository.current().autoPlayNextEpisode) {
                    nextEpisode()
                }
            }
        }
        scope.launch {
            while (isActive) {
                delay(10_000)
                if (playerState.value.isPlaying) saveProgress()
            }
        }
    }

    fun resolve() {
        scope.launch {
            _ui.update { it.copy(isResolving = true, resolveError = null) }
            val session = c.sessionRepository.session.value
            if (session == null) {
                _ui.update { it.copy(isResolving = false, resolveError = AppError.NotLoggedIn) }
                return@launch
            }
            when (target.type) {
                ContentType.LIVE -> resolveLive()
                ContentType.MOVIE -> resolveMovie()
                ContentType.EPISODE -> resolveEpisode()
                ContentType.SERIES -> _ui.update { it.copy(isResolving = false, resolveError = AppError.NotFound) }
            }
        }
    }

    private suspend fun resolveLive() {
        val all = c.xtreamRepository.liveChannels().getOrNull().orEmpty()
        val inCategory = when (val cat = target.categoryId) {
            null, "", Category.ALL_ID -> all
            Category.FAVORITES_ID -> {
                val ids = c.favoritesRepository.favorites.first().filter { it.type == ContentType.LIVE }.mapTo(HashSet()) { it.id }
                all.filter { it.streamId in ids }
            }
            else -> all.filter { it.categoryId == cat }
        }
        val list = if (inCategory.any { it.streamId == target.id }) inCategory else all
        val channel = list.firstOrNull { it.streamId == target.id }
            ?: LiveChannel(target.id, 0, target.title, null, target.categoryId, null, false)
        _ui.update { it.copy(channels = list) }
        playChannel(channel)
    }

    fun zap(offset: Int) {
        val channels = _ui.value.channels
        if (channels.isEmpty()) return
        val baseId = _ui.value.zappingChannel?.streamId ?: _ui.value.currentChannelId
        val index = channels.indexOfFirst { it.streamId == baseId }.coerceAtLeast(0)
        val next = channels[(index + offset).mod(channels.size)]
        _ui.update { it.copy(zappingChannel = next) }
        zapJob?.cancel()
        zapJob = scope.launch {
            delay(ZAP_DEBOUNCE_MS)
            playChannel(next)
        }
    }

    fun selectChannel(channel: LiveChannel) {
        zapJob?.cancel()
        if (channel.streamId == _ui.value.currentChannelId && playerState.value.status != PlaybackStatus.ERROR) return
        zapJob = scope.launch { playChannel(channel) }
    }

    private suspend fun playChannel(channel: LiveChannel) {
        val session = c.sessionRepository.session.value ?: return
        val sources = c.streamUrlBuilder.live(
            session.credentials,
            channel.streamId,
            c.settingsRepository.current().liveStreamFormat,
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
        start(PlaybackRequest(ContentType.LIVE, channel.streamId, channel.name, artworkUrl = channel.logoUrl, sources = sources))
    }

    private suspend fun resolveMovie() {
        val session = c.sessionRepository.session.value ?: return
        var ext = target.extension ?: c.xtreamRepository.cachedMovie(target.id)?.containerExtension
        var title = target.title
        var poster = c.xtreamRepository.cachedMovie(target.id)?.posterUrl
        if (ext == null || title.isBlank()) {
            c.xtreamRepository.movieDetails(target.id).getOrNull()?.let { d ->
                ext = ext ?: d.movie.containerExtension
                if (title.isBlank()) title = d.movie.name
                poster = poster ?: d.movie.posterUrl
            }
        }
        val source = c.streamUrlBuilder.movie(session.credentials, target.id, ext)
        if (source == null) {
            _ui.update { it.copy(isResolving = false, resolveError = AppError.InvalidUrl) }
            return
        }
        val startAt = resumePosition(ContentType.MOVIE, target.id, target.resume)
        _ui.update { it.copy(title = title, isResolving = false, resumedFromMs = startAt.takeIf { p -> p > 0 }) }
        start(PlaybackRequest(ContentType.MOVIE, target.id, title, artworkUrl = poster, sources = listOf(source), startPositionMs = startAt))
    }

    private suspend fun resolveEpisode() {
        val details = target.seriesId?.let { c.xtreamRepository.seriesDetails(it).getOrNull() }
        seriesName = details?.series?.name
        episodes = details?.allEpisodes.orEmpty()
        val episode = episodes.firstOrNull { it.id == target.id } ?: Episode(
            target.id, target.seriesId ?: 0, 0, 0, target.title, target.extension, null, null, null, null
        )
        playEpisode(episode, target.resume)
    }

    fun nextEpisode() = moveEpisode(+1)
    fun previousEpisode() = moveEpisode(-1)

    private fun moveEpisode(offset: Int) {
        val current = currentEpisode ?: return
        val index = episodes.indexOfFirst { it.id == current.id }
        val next = episodes.getOrNull(index + offset) ?: return
        saveProgress()
        scope.launch { playEpisode(next, true) }
    }

    private suspend fun playEpisode(episode: Episode, resume: Boolean) {
        val session = c.sessionRepository.session.value ?: return
        val source = c.streamUrlBuilder.episode(session.credentials, episode.id, episode.containerExtension ?: target.extension)
        if (source == null) {
            _ui.update { it.copy(isResolving = false, resolveError = AppError.InvalidUrl) }
            return
        }
        currentEpisode = episode
        val index = episodes.indexOfFirst { it.id == episode.id }
        val label = if (episode.season > 0) "T${episode.season} · E${episode.episodeNumber}" else null
        val subtitle = listOfNotNull(seriesName, label).joinToString(" · ").ifBlank { null }
        val startAt = resumePosition(ContentType.EPISODE, episode.id, resume)
        _ui.update {
            it.copy(
                title = episode.title,
                subtitle = subtitle,
                isResolving = false,
                resolveError = null,
                hasNextEpisode = index >= 0 && index < episodes.lastIndex,
                hasPreviousEpisode = index > 0,
                resumedFromMs = startAt.takeIf { p -> p > 0 }
            )
        }
        start(PlaybackRequest(ContentType.EPISODE, episode.id, episode.title, subtitle, episode.imageUrl, listOf(source), startAt))
    }

    private fun start(request: PlaybackRequest) {
        activeRequest = request
        endedHandledFor = null
        manager.play(ownerId, request)
    }

    private suspend fun resumePosition(type: ContentType, id: Long, resume: Boolean): Long {
        if (!resume) return 0L
        val p = c.historyRepository.get(type, id) ?: return 0L
        val finished = p.durationMs > 0 && p.positionMs >= p.durationMs * FINISHED_RATIO
        return if (p.positionMs >= MIN_RESUME_MS && !finished) p.positionMs else 0L
    }

    fun retry() {
        if (playerState.value.request != null && manager.isOwnedBy(ownerId)) manager.retry(ownerId) else resolve()
    }

    private fun saveProgress() {
        if (!manager.isOwnedBy(ownerId)) return
        val state = playerState.value
        val request = state.request ?: return
        if (request.isLive || request.contentKey != activeRequest?.contentKey) return
        val position = state.positionMs
        val duration = state.durationMs
        if (position < MIN_RESUME_MS) return
        val episode = currentEpisode?.takeIf { request.type == ContentType.EPISODE && it.id == request.contentId }
        val point = ResumePoint(
            request.type, request.contentId, position, duration, System.currentTimeMillis(),
            episode?.seriesId, episode?.season, episode?.episodeNumber, request.title, request.artworkUrl
        )
        c.applicationScope.launch {
            if (duration > 0 && position >= duration * FINISHED_RATIO) c.historyRepository.remove(request.type, request.contentId)
            else c.historyRepository.save(point)
        }
    }

    override fun onDispose() {
        zapJob?.cancel()
        saveProgress()
        manager.stop(ownerId)
        super.onDispose()
    }

    private companion object {
        const val ZAP_DEBOUNCE_MS = 400L
        const val MIN_RESUME_MS = 10_000L
        const val FINISHED_RATIO = 0.95
    }
}
