package com.webpro.player.player

import android.content.Context
import android.os.SystemClock
import androidx.annotation.MainThread
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import com.webpro.player.utils.NetworkMonitor
import com.webpro.player.utils.SafeLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * The only owner of an [ExoPlayer] in the app. Live TV, movies and episodes all play
 * through this class, which guarantees:
 *
 * - at most one ExoPlayer instance, created lazily and released explicitly,
 * - a single listener per instance (no duplicated callbacks),
 * - stale events from a previous item are ignored (generation counter + media id),
 * - bounded reconnection with backoff and fallback to alternative stream formats,
 * - ownership: only the screen that started playback can stop or release it, so a
 *   closing player screen never kills the playback started by the next one.
 *
 * Every method must be called on the main thread.
 */
@OptIn(UnstableApi::class)
class PlayerManager(
    context: Context,
    private val dataSourceFactory: DataSource.Factory,
    private val networkMonitor: NetworkMonitor,
    private val retryPolicy: RetryPolicy = RetryPolicy()
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val _player = MutableStateFlow<Player?>(null)

    /** Current player instance for the video surface; null while released. */
    val player: StateFlow<Player?> = _player.asStateFlow()

    private var exoPlayer: ExoPlayer? = null
    private var ownerId: String? = null
    private var currentRequest: PlaybackRequest? = null
    private var sourceIndex = 0
    private var retryAttempt = 0
    private var generation = 0L
    private var activeMediaId: String? = null
    private var lastReadyElapsed = 0L
    private var pendingResumePositionMs: Long? = null
    private var retryJob: Job? = null
    private var progressJob: Job? = null

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (!isCurrentItem()) return
            when (playbackState) {
                Player.STATE_BUFFERING -> if (_state.value.status != PlaybackStatus.RECONNECTING) {
                    setStatus(PlaybackStatus.BUFFERING)
                }
                Player.STATE_READY -> {
                    lastReadyElapsed = SystemClock.elapsedRealtime()
                    setStatus(if (exoPlayer?.playWhenReady == true) PlaybackStatus.PLAYING else PlaybackStatus.PAUSED)
                    _state.update { it.copy(error = null, retryAttempt = 0) }
                    refreshProgress()
                }
                Player.STATE_ENDED -> setStatus(PlaybackStatus.ENDED)
                Player.STATE_IDLE -> Unit
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (!isCurrentItem()) return
            val player = exoPlayer ?: return
            if (player.playbackState == Player.STATE_READY) {
                setStatus(if (isPlaying || player.playWhenReady) PlaybackStatus.PLAYING else PlaybackStatus.PAUSED)
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            if (!isCurrentItem()) return
            handleError(error)
        }

        override fun onVideoSizeChanged(videoSize: VideoSize) {
            if (videoSize.width > 0 && videoSize.height > 0) {
                val ratio = videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height
                _state.update { it.copy(videoAspectRatio = ratio) }
            }
        }

        override fun onVolumeChanged(volume: Float) {
            _state.update { it.copy(isMuted = volume == 0f) }
        }
    }

    init {
        scope.launch {
            networkMonitor.isOnline.collect { online -> if (online) onNetworkAvailable() }
        }
    }

    /**
     * Starts playing [request] for [owner]. Calling it again with the same content
     * (double click, recomposition, rotation) is a no-op unless [force] is set.
     */
    @MainThread
    fun play(owner: String, request: PlaybackRequest, force: Boolean = false) {
        val sameContent = ownerId == owner && currentRequest?.contentKey == request.contentKey &&
            exoPlayer != null && _state.value.status != PlaybackStatus.ERROR
        if (sameContent && !force) return
        ownerId = owner
        currentRequest = request
        sourceIndex = 0
        retryAttempt = 0
        pendingResumePositionMs = null
        _state.value = PlayerState(
            request = request,
            status = PlaybackStatus.PREPARING,
            isLive = request.isLive,
            maxRetries = retryPolicy.maxAttempts,
            isMuted = _state.value.isMuted
        )
        load(request.startPositionMs)
    }

    /** Manual retry requested by the user after an error. */
    @MainThread
    fun retry(owner: String) {
        if (owner != ownerId) return
        val request = currentRequest ?: return
        retryAttempt = 0
        sourceIndex = 0
        val position = if (request.isLive) 0L else _state.value.positionMs
        _state.update { it.copy(status = PlaybackStatus.PREPARING, error = null, retryAttempt = 0) }
        load(position)
    }

    @MainThread
    fun togglePlayPause() {
        val player = exoPlayer ?: return
        when {
            _state.value.status == PlaybackStatus.ENDED -> {
                player.seekTo(0)
                player.play()
            }
            player.playWhenReady -> player.pause()
            else -> {
                if (currentRequest?.isLive == true) player.seekToDefaultPosition()
                player.play()
            }
        }
        if (player.playbackState == Player.STATE_READY) {
            setStatus(if (player.playWhenReady) PlaybackStatus.PLAYING else PlaybackStatus.PAUSED)
        }
    }

    @MainThread
    fun pause() {
        exoPlayer?.pause()
    }

    @MainThread
    fun seekBy(deltaMs: Long) {
        val player = exoPlayer ?: return
        if (!player.isCurrentMediaItemSeekable || player.isCurrentMediaItemLive) return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: return
        player.seekTo((player.currentPosition + deltaMs).coerceIn(0L, duration))
        refreshProgress()
    }

    @MainThread
    fun seekTo(positionMs: Long) {
        val player = exoPlayer ?: return
        if (!player.isCurrentMediaItemSeekable || player.isCurrentMediaItemLive) return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: return
        player.seekTo(positionMs.coerceIn(0L, duration))
        refreshProgress()
    }

    @MainThread
    fun toggleMute() {
        val player = exoPlayer ?: return
        player.volume = if (player.volume == 0f) 1f else 0f
    }

    fun isOwnedBy(owner: String): Boolean = ownerId == owner

    /** Current position, used to save "continue watching" progress. */
    @MainThread
    fun currentPositionMs(): Long = exoPlayer?.currentPosition ?: _state.value.positionMs

    /**
     * The host screen went to background: remember the position and free the decoder
     * and network. [onHostStarted] restores playback.
     */
    @MainThread
    fun onHostStopped(owner: String) {
        if (owner != ownerId) return
        val request = currentRequest ?: return
        pendingResumePositionMs = if (request.isLive) null else currentPositionMs()
        releasePlayer()
        _state.update { it.copy(status = PlaybackStatus.IDLE) }
    }

    @MainThread
    fun onHostStarted(owner: String) {
        if (owner != ownerId || exoPlayer != null) return
        if (currentRequest == null) return
        retryAttempt = 0
        _state.update { it.copy(status = PlaybackStatus.PREPARING, error = null) }
        load(pendingResumePositionMs ?: 0L)
        pendingResumePositionMs = null
    }

    /** Stops and releases everything if [owner] still owns the playback. */
    @MainThread
    fun release(owner: String) {
        if (owner != ownerId) return
        releasePlayer()
        ownerId = null
        currentRequest = null
        pendingResumePositionMs = null
        _state.value = PlayerState()
    }

    private fun load(startPositionMs: Long) {
        val request = currentRequest ?: return
        val source = request.sources.getOrNull(sourceIndex)
        if (source == null) {
            fail(PlayerError.Source)
            return
        }
        cancelRetry()
        generation++
        val mediaId = "${request.contentKey}#$generation"
        activeMediaId = mediaId
        lastReadyElapsed = 0L
        val player = ensurePlayer()
        val item = MediaItemFactory.create(request, source, mediaId)
        if (request.isLive || startPositionMs <= 0L) player.setMediaItem(item, true)
        else player.setMediaItem(item, startPositionMs)
        player.playWhenReady = true
        player.prepare()
        _state.update { it.copy(sourceIndex = sourceIndex, error = null) }
    }

    private fun handleError(error: PlaybackException) {
        val causes = PlayerErrorClassifier.causeChain(error)
        val httpStatus = causes.filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
            .firstOrNull()?.responseCode
        val classified = PlayerErrorClassifier.classify(error.errorCode, httpStatus, causes)
        SafeLog.w("Playback error ${error.errorCodeName} -> ${classified.javaClass.simpleName}")

        // A stream that played fine for a while gets a fresh set of attempts.
        if (lastReadyElapsed > 0L && SystemClock.elapsedRealtime() - lastReadyElapsed > STABLE_PLAYBACK_MS) {
            retryAttempt = 0
        }
        lastReadyElapsed = 0L

        when {
            classified.recoverable && networkMonitor.isOnline.value.not() -> {
                // No network: wait for it instead of burning attempts; resumes in onNetworkAvailable().
                fail(PlayerError.Network)
            }
            classified.recoverable -> scheduleRetry(classified)
            classified.tryAlternativeSource && hasAlternativeSource() -> switchToNextSource()
            else -> fail(classified)
        }
    }

    private fun scheduleRetry(error: PlayerError) {
        val delayMs = retryPolicy.delayForAttempt(retryAttempt + 1)
        if (delayMs == null) {
            if (error.tryAlternativeSource && hasAlternativeSource()) switchToNextSource() else fail(error)
            return
        }
        retryAttempt++
        _state.update {
            it.copy(
                status = PlaybackStatus.RECONNECTING,
                error = error,
                retryAttempt = retryAttempt,
                maxRetries = retryPolicy.maxAttempts
            )
        }
        val expectedGeneration = generation
        cancelRetry()
        retryJob = scope.launch {
            delay(delayMs)
            if (expectedGeneration != generation) return@launch
            reprepare(error)
        }
    }

    private fun reprepare(error: PlayerError) {
        val player = exoPlayer ?: return
        val request = currentRequest ?: return
        if (request.isLive || error is PlayerError.BehindLiveWindow) player.seekToDefaultPosition()
        player.playWhenReady = true
        player.prepare()
    }

    private fun hasAlternativeSource(): Boolean =
        (currentRequest?.sources?.size ?: 0) > sourceIndex + 1

    private fun switchToNextSource() {
        val request = currentRequest ?: return
        sourceIndex++
        retryAttempt = 0
        SafeLog.d("Switching to alternative stream format #$sourceIndex")
        load(if (request.isLive) 0L else _state.value.positionMs)
    }

    private fun fail(error: PlayerError) {
        cancelRetry()
        _state.update { it.copy(status = PlaybackStatus.ERROR, error = error, retryAttempt = retryAttempt) }
    }

    private fun onNetworkAvailable() {
        val current = _state.value
        val error = current.error ?: return
        if (current.status != PlaybackStatus.ERROR || !error.isConnectivityRelated) return
        if (exoPlayer == null || currentRequest == null) return
        retryAttempt = 0
        _state.update { it.copy(status = PlaybackStatus.RECONNECTING, retryAttempt = 0) }
        reprepare(error)
    }

    private fun ensurePlayer(): ExoPlayer {
        exoPlayer?.let { return it }
        val extractors = DefaultExtractorsFactory()
            .setConstantBitrateSeekingEnabled(true)
            .setTsExtractorFlags(
                DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or
                    DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
            )
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory, extractors)
            .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(LOADER_RETRIES))
        // Hardware decoders first; the bundled FFmpeg extension takes over the audio codecs
        // many devices lack (AC3, E-AC3, DTS, MP2...), so IPTV channels never play silent.
        val renderers = DefaultRenderersFactory(appContext)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(MIN_BUFFER_MS, MAX_BUFFER_MS, BUFFER_FOR_PLAYBACK_MS, BUFFER_AFTER_REBUFFER_MS)
            .build()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        val player = ExoPlayer.Builder(appContext, renderers)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(audioAttributes, true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
            .build()
        player.addListener(listener)
        if (_state.value.isMuted) player.volume = 0f
        exoPlayer = player
        _player.value = player
        startProgressUpdates()
        return player
    }

    private fun releasePlayer() {
        cancelRetry()
        progressJob?.cancel()
        progressJob = null
        generation++
        activeMediaId = null
        exoPlayer?.let { player ->
            player.removeListener(listener)
            runCatching { player.stop() }
            player.release()
        }
        exoPlayer = null
        _player.value = null
    }

    private fun startProgressUpdates() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                refreshProgress()
                delay(PROGRESS_INTERVAL_MS)
            }
        }
    }

    private fun refreshProgress() {
        val player = exoPlayer ?: return
        val duration = player.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        val live = player.isCurrentMediaItemLive || currentRequest?.isLive == true
        _state.update {
            it.copy(
                positionMs = player.currentPosition.coerceAtLeast(0L),
                durationMs = duration,
                bufferedPositionMs = player.bufferedPosition.coerceAtLeast(0L),
                isLive = live,
                isSeekable = player.isCurrentMediaItemSeekable && !live
            )
        }
    }

    private fun setStatus(status: PlaybackStatus) {
        _state.update { if (it.status == status) it else it.copy(status = status) }
    }

    private fun isCurrentItem(): Boolean {
        val player = exoPlayer ?: return false
        val mediaId = player.currentMediaItem?.mediaId ?: return false
        return mediaId == activeMediaId
    }

    private fun cancelRetry() {
        retryJob?.cancel()
        retryJob = null
    }

    private companion object {
        const val MIN_BUFFER_MS = 15_000
        const val MAX_BUFFER_MS = 50_000
        const val BUFFER_FOR_PLAYBACK_MS = 2_000
        const val BUFFER_AFTER_REBUFFER_MS = 4_000
        const val LOADER_RETRIES = 2
        const val SEEK_INCREMENT_MS = 10_000L
        const val PROGRESS_INTERVAL_MS = 500L
        const val STABLE_PLAYBACK_MS = 15_000L
    }
}
