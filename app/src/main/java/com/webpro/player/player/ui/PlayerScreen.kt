package com.webpro.player.player.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.media.AudioManager
import android.view.ViewGroup
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerViewModel
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.message
import kotlinx.coroutines.delay

/** Video scaling modes offered to the user. */
enum class ResizeOption(val mode: Int) {
    FIT(AspectRatioFrameLayout.RESIZE_MODE_FIT),
    ZOOM(AspectRatioFrameLayout.RESIZE_MODE_ZOOM),
    FILL(AspectRatioFrameLayout.RESIZE_MODE_FILL);

    fun next(): ResizeOption = entries[(ordinal + 1) % entries.size]
}

/**
 * Fullscreen player shared by live TV, movies and episodes. All playback goes
 * through [PlayerViewModel] -> PlayerManager; this composable only renders the
 * surface, overlays and maps touch / remote-control input to actions.
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    onBack: () -> Unit,
    viewModel: PlayerViewModel = viewModel(factory = PlayerViewModel.Factory)
) {
    val state by viewModel.playerState.collectAsStateWithLifecycle()
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    val player by viewModel.player.collectAsStateWithLifecycle()
    val device = LocalDeviceProfile.current
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val audioManager = remember(context) { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }

    var controlsVisible by remember { mutableStateOf(true) }
    var channelPanelVisible by remember { mutableStateOf(false) }
    var interactionTick by remember { mutableIntStateOf(0) }
    var resizeOption by rememberSaveable { mutableStateOf(ResizeOption.FIT) }
    var landscapeLocked by rememberSaveable { mutableStateOf(true) }
    var volumeHud by remember { mutableStateOf<Float?>(null) }
    var volumeTick by remember { mutableIntStateOf(0) }
    var resumeHintVisible by remember { mutableStateOf(false) }
    var seekFeedback by remember { mutableFloatStateOf(0f) }

    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }
    val errorFocus = remember { FocusRequester() }

    // ------------------------------------------------------------ lifecycle
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> viewModel.onHostStart()
                Lifecycle.Event.ON_STOP -> if (activity?.isChangingConfigurations != true) viewModel.onHostStop()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // ------------------------------------------------------------ fullscreen + orientation
    DisposableEffect(activity) {
        val window = activity?.window
        val insetsController = window?.let { WindowCompat.getInsetsController(it, it.decorView) }
        insetsController?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController?.hide(WindowInsetsCompat.Type.systemBars())
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val originalOrientation = activity?.requestedOrientation
        onDispose {
            insetsController?.show(WindowInsetsCompat.Type.systemBars())
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (activity != null && originalOrientation != null) activity.requestedOrientation = originalOrientation
        }
    }
    if (!device.isTv) {
        LaunchedEffect(landscapeLocked, activity) {
            activity?.requestedOrientation = if (landscapeLocked) ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            else ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    // ------------------------------------------------------------ overlays timing
    val isError = state.status == PlaybackStatus.ERROR || ui.resolveError != null
    LaunchedEffect(controlsVisible, interactionTick, state.isPlaying, channelPanelVisible, isError) {
        if (controlsVisible && state.isPlaying && !channelPanelVisible && !isError) {
            delay(CONTROLS_TIMEOUT_MS)
            controlsVisible = false
        }
    }
    LaunchedEffect(controlsVisible, channelPanelVisible, isError) {
        delay(80)
        runCatching {
            when {
                isError || channelPanelVisible -> Unit
                controlsVisible && device.isTv -> playFocus.requestFocus()
                !controlsVisible -> rootFocus.requestFocus()
            }
        }
    }
    LaunchedEffect(volumeTick) {
        if (volumeHud != null) {
            delay(1500)
            volumeHud = null
        }
    }
    LaunchedEffect(ui.resumedFromMs) {
        if (ui.resumedFromMs != null) {
            resumeHintVisible = true
            delay(3500)
            resumeHintVisible = false
        }
    }
    LaunchedEffect(seekFeedback) {
        if (seekFeedback != 0f) {
            delay(900)
            seekFeedback = 0f
        }
    }

    fun showControls() {
        controlsVisible = true
        interactionTick++
    }

    fun changeVolume(direction: Int) {
        val flag = when (direction) {
            0 -> AudioManager.ADJUST_TOGGLE_MUTE
            else -> if (direction > 0) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        }
        runCatching { audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, flag, 0) }
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val muted = runCatching { audioManager.isStreamMute(AudioManager.STREAM_MUSIC) }.getOrDefault(false)
        volumeHud = if (muted) 0f else audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / max
        volumeTick++
        interactionTick++
    }

    fun seekWithFeedback(deltaMs: Long) {
        if (!state.canSeek) return
        viewModel.seekBy(deltaMs)
        seekFeedback = (deltaMs / 1000f)
        interactionTick++
    }

    fun handleKey(event: KeyEvent): Boolean {
        if (event.type != KeyEventType.KeyDown) return false
        interactionTick++
        when (event.key) {
            Key.MediaPlayPause, Key.MediaPlay, Key.MediaPause -> {
                viewModel.togglePlayPause(); showControls(); return true
            }
            Key.MediaFastForward -> { seekWithFeedback(SEEK_LONG_MS); showControls(); return true }
            Key.MediaRewind -> { seekWithFeedback(-SEEK_LONG_MS); showControls(); return true }
            Key.ChannelUp, Key.PageUp -> if (ui.isLive) { viewModel.zap(-1); return true }
            Key.ChannelDown, Key.PageDown -> if (ui.isLive) { viewModel.zap(+1); return true }
            Key.MediaNext -> if (ui.hasNextEpisode) { viewModel.nextEpisode(); return true }
            Key.MediaPrevious -> if (ui.hasPreviousEpisode) { viewModel.previousEpisode(); return true }
        }
        if (channelPanelVisible || isError || controlsVisible) return false
        return when (event.key) {
            Key.DirectionUp -> {
                if (ui.isLive) viewModel.zap(-1) else showControls(); true
            }
            Key.DirectionDown -> {
                if (ui.isLive) viewModel.zap(+1) else showControls(); true
            }
            Key.DirectionLeft -> {
                when {
                    ui.isLive && ui.channels.isNotEmpty() -> channelPanelVisible = true
                    state.canSeek -> { seekWithFeedback(-SEEK_SHORT_MS); showControls() }
                    else -> showControls()
                }
                true
            }
            Key.DirectionRight -> {
                if (state.canSeek) seekWithFeedback(SEEK_SHORT_MS)
                showControls(); true
            }
            Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.Spacebar -> { showControls(); true }
            else -> false
        }
    }

    BackHandler {
        when {
            channelPanelVisible -> channelPanelVisible = false
            controlsVisible && device.isTv && !isError -> controlsVisible = false
            else -> onBack()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent(::handleKey)
            .focusRequester(rootFocus)
            .focusable()
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                    setKeepContentOnPlayerReset(true)
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    isFocusable = false
                    isFocusableInTouchMode = false
                    descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
                }
            },
            update = { view ->
                if (view.player !== player) view.player = player
                view.resizeMode = resizeOption.mode
            },
            onRelease = { view -> view.player = null },
            modifier = Modifier.fillMaxSize()
        )

        // Touch layer: tap toggles controls, double tap seeks on VOD.
        Box(
            Modifier
                .fillMaxSize()
                .pointerInput(state.canSeek) {
                    detectTapGestures(
                        onTap = {
                            if (controlsVisible) controlsVisible = false else showControls()
                        },
                        onDoubleTap = { offset ->
                            if (state.canSeek) {
                                seekWithFeedback(if (offset.x < size.width / 2f) -SEEK_SHORT_MS else SEEK_SHORT_MS)
                            } else {
                                showControls()
                            }
                        }
                    )
                }
        )

        PlayerStatusOverlay(
            state = state,
            isResolving = ui.isResolving,
            showSpinner = !isError,
            modifier = Modifier.align(Alignment.Center)
        )

        SlowNetworkBanner(
            adaptations = state.slowNetworkAdaptations,
            modifier = Modifier.align(Alignment.TopCenter)
        )

        ReconnectingBanner(
            state = state,
            modifier = Modifier
                .align(Alignment.TopCenter)
        )

        ZappingOverlay(
            channel = ui.zappingChannel,
            modifier = Modifier.align(Alignment.TopStart)
        )

        SeekFeedback(
            seconds = seekFeedback,
            modifier = Modifier.align(Alignment.Center)
        )

        VolumeHud(
            level = volumeHud,
            modifier = Modifier.align(Alignment.CenterEnd)
        )

        ResumeHint(
            visible = resumeHintVisible && !controlsVisible,
            positionMs = ui.resumedFromMs,
            modifier = Modifier.align(Alignment.BottomStart)
        )

        AnimatedVisibility(
            visible = controlsVisible && !isError,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            PlayerControls(
                state = state,
                ui = ui,
                isTv = device.isTv,
                playFocusRequester = playFocus,
                resizeOption = resizeOption,
                landscapeLocked = landscapeLocked,
                onInteraction = { interactionTick++ },
                onHide = { controlsVisible = false },
                onBack = onBack,
                onTogglePlay = { viewModel.togglePlayPause(); interactionTick++ },
                onSeekBy = ::seekWithFeedback,
                onSeekTo = { viewModel.seekTo(it); interactionTick++ },
                onPreviousChannel = { viewModel.zap(-1); interactionTick++ },
                onNextChannel = { viewModel.zap(+1); interactionTick++ },
                onOpenChannels = { channelPanelVisible = true },
                onPreviousEpisode = viewModel::previousEpisode,
                onNextEpisode = viewModel::nextEpisode,
                onVolumeDown = { changeVolume(-1) },
                onVolumeUp = { changeVolume(+1) },
                onToggleMute = { changeVolume(0) },
                onCycleResize = { resizeOption = resizeOption.next(); interactionTick++ },
                onToggleOrientation = if (device.isTv) null else ({ landscapeLocked = !landscapeLocked })
            )
        }

        AnimatedVisibility(
            visible = channelPanelVisible,
            enter = slideInHorizontally { -it } + fadeIn(),
            exit = slideOutHorizontally { -it } + fadeOut(),
            modifier = Modifier.align(Alignment.CenterStart)
        ) {
            ChannelPanel(
                channels = ui.channels,
                currentChannelId = ui.currentChannelId,
                isTv = device.isTv,
                onSelect = { channel ->
                    viewModel.selectChannel(channel)
                    channelPanelVisible = false
                    controlsVisible = false
                },
                onDismiss = { channelPanelVisible = false }
            )
        }

        if (isError) {
            val message = ui.resolveError?.message() ?: state.error?.message().orEmpty()
            PlayerErrorOverlay(
                message = message,
                focusRequester = errorFocus,
                onRetry = viewModel::retry,
                onBack = onBack,
                onOpenChannels = if (ui.isLive && ui.channels.size > 1) ({ channelPanelVisible = true }) else null
            )
        }
    }
}

private const val CONTROLS_TIMEOUT_MS = 4_500L
private const val SEEK_SHORT_MS = 10_000L
private const val SEEK_LONG_MS = 30_000L

internal fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return null
}
