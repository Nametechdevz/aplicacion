package com.webpro.player.desktop.player

import com.webpro.player.desktop.storage.FileSettingsRepository
import com.webpro.player.player.PlaybackRequest
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerError
import com.webpro.player.player.PlayerState
import com.webpro.player.player.RetryPolicy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.caprica.vlcj.factory.MediaPlayerFactory
import uk.co.caprica.vlcj.media.MediaRef
import uk.co.caprica.vlcj.player.base.MediaPlayer
import uk.co.caprica.vlcj.player.base.MediaPlayerEventAdapter
import uk.co.caprica.vlcj.player.embedded.EmbeddedMediaPlayer
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicLong

data class TrackOption(val id: Int, val name: String)

data class TrackState(
    val audio: List<TrackOption> = emptyList(),
    val selectedAudio: Int = -1,
    val subtitles: List<TrackOption> = emptyList(),
    val selectedSubtitle: Int = -1
)

/**
 * Windows counterpart of the Android PlayerManager: the only owner of the libVLC
 * player. Guarantees a single player instance, serialized native calls on a dedicated
 * thread (the UI never blocks on libVLC), stale-event filtering, bounded reconnection
 * with backoff, HLS/TS fallback and HTTP-level diagnosis of failures.
 *
 * Public methods must be called from the UI (main) thread.
 */
class DesktopPlayerManager(
    private val settings: FileSettingsRepository,
    private val probe: StreamProbe,
    private val retryPolicy: RetryPolicy = RetryPolicy()
) {
    private val ui = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val control = Executors.newSingleThreadExecutor { r ->
        Thread(r, "vlc-control").apply { isDaemon = true }
    }.asCoroutineDispatcher()

    val sink = VideoFrameSink(ui)

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    private val _volume = MutableStateFlow(settings.desktopSettings.value.volume)
    val volume: StateFlow<Int> = _volume.asStateFlow()

    private val _tracks = MutableStateFlow(TrackState())
    val tracks: StateFlow<TrackState> = _tracks.asStateFlow()

    /** false when libVLC could not be loaded (shown as a dedicated error). */
    private val _engineAvailable = MutableStateFlow(true)
    val engineAvailable: StateFlow<Boolean> = _engineAvailable.asStateFlow()

    // ---- engine (accessed only on the control thread)
    private var factory: MediaPlayerFactory? = null
    private var mediaPlayer: EmbeddedMediaPlayer? = null
    private var engineHardwareDecoding: Boolean? = null

    // ---- playback bookkeeping (UI thread)
    private var ownerId: String? = null
    private var request: PlaybackRequest? = null
    private var sourceIndex = 0
    private var retryAttempt = 0
    private var generation = 0L
    private var playedCurrentSource = false
    private var lastProgressAt = 0L
    private var lastPlayingAt = 0L
    private var retryJob: Job? = null
    private var watchdogJob: Job? = null
    private var recoveryJob: Job? = null

    /** Generations queued by play() and consumed by the mediaChanged event (VLC event thread). */
    private val pendingGenerations = ConcurrentLinkedQueue<Long>()
    private val eventGeneration = AtomicLong(-1)

    private val events = object : MediaPlayerEventAdapter() {
        override fun mediaChanged(mediaPlayer: MediaPlayer, media: MediaRef?) {
            pendingGenerations.poll()?.let { eventGeneration.set(it) }
        }

        override fun opening(mediaPlayer: MediaPlayer) = post { onStatus(PlaybackStatus.PREPARING) }
        override fun buffering(mediaPlayer: MediaPlayer, newCache: Float) = post {
            if (newCache < 100f) onStatus(PlaybackStatus.BUFFERING) else onPlaying()
        }
        override fun playing(mediaPlayer: MediaPlayer) = post { onPlaying() }
        override fun paused(mediaPlayer: MediaPlayer) = post { onStatus(PlaybackStatus.PAUSED) }
        override fun finished(mediaPlayer: MediaPlayer) = post { onFinished() }
        override fun error(mediaPlayer: MediaPlayer) = post { onError() }
        override fun timeChanged(mediaPlayer: MediaPlayer, newTime: Long) = post { onTime(newTime) }
        override fun lengthChanged(mediaPlayer: MediaPlayer, newLength: Long) = post {
            _state.update { it.copy(durationMs = newLength.coerceAtLeast(0L)) }
        }
        override fun seekableChanged(mediaPlayer: MediaPlayer, newSeekable: Int) = post {
            _state.update { it.copy(isSeekable = newSeekable != 0 && request?.isLive != true) }
        }
        override fun elementaryStreamAdded(
            mediaPlayer: MediaPlayer,
            type: uk.co.caprica.vlcj.media.TrackType?,
            id: Int
        ) = post { refreshTracks() }
        override fun videoOutput(mediaPlayer: MediaPlayer, newCount: Int) = post { refreshTracks() }
        override fun muted(mediaPlayer: MediaPlayer, muted: Boolean) = post {
            _state.update { it.copy(isMuted = muted) }
        }

        /** Runs [block] on the UI thread only if the event belongs to the current item. */
        private fun post(block: () -> Unit) {
            val gen = eventGeneration.get()
            ui.launch { if (gen == generation) block() }
        }
    }

    // =====================================================================
    // Public API (UI thread)
    // =====================================================================

    fun isOwnedBy(owner: String) = ownerId == owner

    /** Plays [request]; repeated calls with the same content are ignored unless [force]. */
    fun play(owner: String, request: PlaybackRequest, force: Boolean = false) {
        val same = ownerId == owner && this.request?.contentKey == request.contentKey &&
            _state.value.status != PlaybackStatus.ERROR && _state.value.status != PlaybackStatus.IDLE
        if (same && !force) return
        ownerId = owner
        this.request = request
        sourceIndex = 0
        retryAttempt = 0
        _tracks.value = TrackState()
        _state.value = PlayerState(
            request = request,
            status = PlaybackStatus.PREPARING,
            isLive = request.isLive,
            maxRetries = retryPolicy.maxAttempts,
            isMuted = _state.value.isMuted
        )
        sink.clear()
        load(request.startPositionMs)
    }

    fun retry(owner: String) {
        if (owner != ownerId) return
        val current = request ?: return
        retryAttempt = 0
        sourceIndex = 0
        _state.update { it.copy(status = PlaybackStatus.PREPARING, error = null, retryAttempt = 0) }
        load(if (current.isLive) 0L else _state.value.positionMs)
    }

    fun togglePlayPause() {
        val current = request ?: return
        when (_state.value.status) {
            PlaybackStatus.PLAYING, PlaybackStatus.BUFFERING -> {
                if (current.isLive) {
                    // Live: stop downloading while paused; resume jumps back to the live edge.
                    cancelJobs()
                    generation++
                    onControl { controls().stop() }
                    _state.update { it.copy(status = PlaybackStatus.PAUSED) }
                } else {
                    onControl { controls().setPause(true) }
                }
            }
            PlaybackStatus.PAUSED -> {
                if (current.isLive) load(0L) else onControl { controls().setPause(false) }
            }
            PlaybackStatus.ENDED -> load(0L)
            PlaybackStatus.ERROR -> ownerId?.let(::retry)
            else -> Unit
        }
    }

    fun seekBy(deltaMs: Long) {
        val state = _state.value
        if (!state.canSeek) return
        seekTo(state.positionMs + deltaMs)
    }

    fun seekTo(positionMs: Long) {
        val state = _state.value
        if (!state.canSeek) return
        val target = positionMs.coerceIn(0L, (state.durationMs - 1000L).coerceAtLeast(0L))
        _state.update { it.copy(positionMs = target) }
        lastProgressAt = now()
        onControl { controls().setTime(target) }
    }

    fun setVolume(value: Int) {
        val volume = value.coerceIn(0, FileSettingsRepository.MAX_VOLUME)
        _volume.value = volume
        onControl {
            audio().setVolume(volume)
            if (volume > 0 && audio().isMute) audio().setMute(false)
        }
        ui.launch { settings.setVolume(volume) }
    }

    fun changeVolume(delta: Int) = setVolume(_volume.value + delta)

    fun toggleMute() {
        onControl { audio().mute() }
    }

    fun selectAudioTrack(id: Int) {
        onControl { audio().setTrack(id) }
        _tracks.update { it.copy(selectedAudio = id) }
    }

    fun selectSubtitle(id: Int) {
        onControl { subpictures().setTrack(id) }
        _tracks.update { it.copy(selectedSubtitle = id) }
    }

    /** Stops playback when the player screen of [owner] closes (engine stays warm). */
    fun stop(owner: String) {
        if (owner != ownerId) return
        cancelJobs()
        generation++
        ownerId = null
        request = null
        onControl { controls().stop() }
        sink.clear()
        _state.value = PlayerState()
        _tracks.value = TrackState()
    }

    /** Applies engine-level settings (hardware decoding) on the next playback. */
    fun invalidateEngine() {
        ui.launch(control) {
            if (mediaPlayer != null && engineHardwareDecoding != settings.desktopSettings.value.hardwareDecoding) {
                releaseEngine()
            }
        }
    }

    /** Preloads libVLC in background so the first channel starts faster. */
    fun warmUp() {
        ui.launch {
            val ok = withContext(control) { ensureEngine() != null }
            _engineAvailable.value = ok
        }
    }

    /** Releases every native resource; call on application exit. */
    fun shutdown() {
        cancelJobs()
        generation++
        runCatching {
            control.executor.execute { releaseEngine() }
        }
    }

    // =====================================================================
    // Internals
    // =====================================================================

    private fun load(startPositionMs: Long) {
        val current = request ?: return
        val source = current.sources.getOrNull(sourceIndex)
        if (source == null) {
            fail(PlayerError.Source)
            return
        }
        cancelJobs()
        val gen = ++generation
        playedCurrentSource = false
        lastProgressAt = now()
        _state.update { it.copy(status = PlaybackStatus.PREPARING, error = null, sourceIndex = sourceIndex) }
        val caching = settings.desktopSettings.value.networkCachingMs
        val options = VlcOptions.mediaOptions(current.isLive, caching, startPositionMs)
        ui.launch {
            val started = withContext(control) {
                val player = ensureEngine() ?: return@withContext null
                if (gen != generation) return@withContext true
                player.controls().stop()
                pendingGenerations.add(gen)
                val ok = player.media().play(source.url, *options)
                if (!ok) pendingGenerations.remove(gen)
                ok
            }
            when (started) {
                null -> {
                    _engineAvailable.value = false
                    fail(PlayerError.Decoder)
                }
                false -> if (gen == generation) handleFailure(probeFirst = true)
                true -> if (gen == generation) startWatchdog(gen)
            }
        }
    }

    private fun onStatus(status: PlaybackStatus) {
        val current = _state.value.status
        if (current == PlaybackStatus.RECONNECTING && status == PlaybackStatus.BUFFERING) return
        if (current == PlaybackStatus.ERROR) return
        _state.update { if (it.status == status) it else it.copy(status = status) }
    }

    private fun onPlaying() {
        playedCurrentSource = true
        lastPlayingAt = now()
        lastProgressAt = now()
        if (_state.value.status != PlaybackStatus.PLAYING) {
            _state.update { it.copy(status = PlaybackStatus.PLAYING, error = null, retryAttempt = 0) }
            // libVLC only accepts a volume once the audio output exists.
            val volume = _volume.value
            onControl { audio().setVolume(volume) }
            refreshTracks()
        }
    }

    private fun onTime(time: Long) {
        if (time != _state.value.positionMs) lastProgressAt = now()
        _state.update { it.copy(positionMs = time.coerceAtLeast(0L)) }
        if (_state.value.status == PlaybackStatus.BUFFERING || _state.value.status == PlaybackStatus.PREPARING) {
            onPlaying()
        }
    }

    private fun onFinished() {
        val current = request ?: return
        if (current.isLive) {
            // A live channel never "ends": the server dropped the connection.
            scheduleRetry(PlayerError.ConnectionReset)
        } else {
            cancelJobs()
            _state.update { it.copy(status = PlaybackStatus.ENDED, positionMs = it.durationMs) }
        }
    }

    private fun onError() {
        handleFailure(probeFirst = true)
    }

    /** Asks the server why the stream failed, then retries, switches format or gives up. */
    private fun handleFailure(probeFirst: Boolean) {
        val current = request ?: return
        val url = current.sources.getOrNull(sourceIndex)?.url ?: return
        val gen = generation
        val playedBefore = playedCurrentSource
        // A stream that played for a while gets a fresh set of attempts.
        if (lastPlayingAt > 0 && now() - lastPlayingAt > STABLE_PLAYBACK_MS) retryAttempt = 0
        cancelJobs()
        _state.update { it.copy(status = PlaybackStatus.RECONNECTING) }
        ui.launch {
            val error = if (probeFirst) PlaybackDiagnosis.classify(probe.probe(url), playedBefore) else PlayerError.Timeout
            if (gen != generation) return@launch
            when {
                error.recoverable -> scheduleRetry(error)
                error.tryAlternativeSource && hasAlternative() -> switchSource()
                else -> fail(error)
            }
        }
    }

    private fun scheduleRetry(error: PlayerError) {
        val delayMs = retryPolicy.delayForAttempt(retryAttempt + 1)
        if (delayMs == null) {
            if (error.tryAlternativeSource && hasAlternative()) switchSource() else fail(error)
            return
        }
        retryAttempt++
        cancelJobs()
        val gen = generation
        _state.update {
            it.copy(
                status = PlaybackStatus.RECONNECTING,
                error = error,
                retryAttempt = retryAttempt,
                maxRetries = retryPolicy.maxAttempts
            )
        }
        retryJob = ui.launch {
            delay(delayMs)
            if (gen != generation) return@launch
            val current = request ?: return@launch
            load(if (current.isLive) 0L else _state.value.positionMs)
        }
    }

    private fun hasAlternative() = (request?.sources?.size ?: 0) > sourceIndex + 1

    private fun switchSource() {
        val current = request ?: return
        sourceIndex++
        retryAttempt = 0
        load(if (current.isLive) 0L else _state.value.positionMs)
    }

    private fun fail(error: PlayerError) {
        cancelJobs()
        generation++
        onControl { controls().stop() }
        _state.update { it.copy(status = PlaybackStatus.ERROR, error = error, retryAttempt = retryAttempt) }
        if (error.isConnectivityRelated) startRecoveryWatch()
    }

    /** Detects frozen streams (no progress) and silently reconnects. */
    private fun startWatchdog(gen: Long) {
        watchdogJob?.cancel()
        watchdogJob = ui.launch {
            while (isActive && gen == generation) {
                delay(1_000)
                val state = _state.value
                val idle = now() - lastProgressAt
                val stalled = when (state.status) {
                    PlaybackStatus.PREPARING -> idle > OPEN_TIMEOUT_MS
                    PlaybackStatus.BUFFERING, PlaybackStatus.RECONNECTING -> idle > BUFFERING_TIMEOUT_MS
                    PlaybackStatus.PLAYING -> state.isLive && idle > LIVE_FROZEN_TIMEOUT_MS
                    else -> false
                }
                if (stalled && gen == generation) {
                    handleFailure(probeFirst = true)
                    break
                }
                if (state.status == PlaybackStatus.PLAYING && sink.needsGeometry) refreshTracks()
            }
        }
    }

    /** After a connectivity failure, waits for the server to answer again and resumes once. */
    private fun startRecoveryWatch() {
        val current = request ?: return
        val url = current.sources.firstOrNull()?.url ?: return
        val gen = generation
        recoveryJob?.cancel()
        recoveryJob = ui.launch {
            val deadline = now() + RECOVERY_WINDOW_MS
            while (isActive && gen == generation && now() < deadline) {
                delay(RECOVERY_POLL_MS)
                if (probe.probe(url) is ProbeResult.Http && gen == generation) {
                    ownerId?.let(::retry)
                    return@launch
                }
            }
        }
    }

    private fun refreshTracks() {
        ui.launch {
            val tracks = withContext(control) {
                val player = mediaPlayer ?: return@withContext null
                runCatching {
                    val dimension = player.video().videoDimension()
                    val videoTrack = player.media().info()?.videoTracks()?.firstOrNull()
                    val sar = videoTrack?.let { t ->
                        if (t.sampleAspectRatio() > 0 && t.sampleAspectRatioBase() > 0) {
                            t.sampleAspectRatio().toFloat() / t.sampleAspectRatioBase()
                        } else 1f
                    } ?: 1f
                    val width = dimension?.width ?: videoTrack?.width() ?: 0
                    val height = dimension?.height ?: videoTrack?.height() ?: 0
                    sink.updateGeometry(width, height, sar)
                    TrackState(
                        audio = player.audio().trackDescriptions().filter { it.id() >= 0 }
                            .map { TrackOption(it.id(), it.description().orEmpty().ifBlank { "Pista ${it.id()}" }) },
                        selectedAudio = player.audio().track(),
                        subtitles = player.subpictures().trackDescriptions()
                            .map { TrackOption(it.id(), if (it.id() < 0) "Desactivados" else it.description().orEmpty()) },
                        selectedSubtitle = player.subpictures().track()
                    )
                }.getOrNull()
            }
            if (tracks != null) _tracks.value = tracks
        }
    }

    private fun cancelJobs() {
        retryJob?.cancel()
        watchdogJob?.cancel()
        recoveryJob?.cancel()
    }

    private fun onControl(block: EmbeddedMediaPlayer.() -> Unit) {
        ui.launch(control) {
            runCatching { mediaPlayer?.block() }
        }
    }

    /** Control thread only. */
    private fun ensureEngine(): EmbeddedMediaPlayer? {
        mediaPlayer?.let { return it }
        if (!VlcRuntime.initialize()) return null
        return runCatching {
            val hw = settings.desktopSettings.value.hardwareDecoding
            // libVLC is already loaded by VlcRuntime: null skips vlcj's own (slow, disk-scanning) discovery.
            val newFactory = MediaPlayerFactory(null, VlcOptions.factoryArgs(hw, VlcOptions.extraArgsFromSystem()))
            val player = newFactory.mediaPlayers().newEmbeddedMediaPlayer()
            player.videoSurface().set(newFactory.videoSurfaces().newVideoSurface(sink, sink, true))
            player.events().addMediaPlayerEventListener(events)
            player.audio().setVolume(_volume.value)
            factory = newFactory
            mediaPlayer = player
            engineHardwareDecoding = hw
            player
        }.getOrNull()
    }

    /** Control thread only. */
    private fun releaseEngine() {
        val player = mediaPlayer
        mediaPlayer = null
        runCatching {
            player?.events()?.removeMediaPlayerEventListener(events)
            player?.controls()?.stop()
            player?.release()
        }
        runCatching { factory?.release() }
        factory = null
        engineHardwareDecoding = null
    }

    private fun now() = System.currentTimeMillis()

    private companion object {
        const val STABLE_PLAYBACK_MS = 15_000L
        const val OPEN_TIMEOUT_MS = 20_000L
        const val BUFFERING_TIMEOUT_MS = 20_000L
        const val LIVE_FROZEN_TIMEOUT_MS = 12_000L
        const val RECOVERY_POLL_MS = 5_000L
        const val RECOVERY_WINDOW_MS = 10 * 60_000L
    }
}
