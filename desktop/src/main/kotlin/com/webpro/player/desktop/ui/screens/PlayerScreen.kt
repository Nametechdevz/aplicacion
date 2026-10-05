package com.webpro.player.desktop.ui.screens

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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.pointerInput
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.LocalWindowController
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.rememberScreenModel
import com.webpro.player.player.PlaybackStatus
import kotlinx.coroutines.delay
import java.awt.Point
import java.awt.Toolkit
import java.awt.image.BufferedImage

private val hiddenCursor: PointerIcon by lazy {
    PointerIcon(
        Toolkit.getDefaultToolkit().createCustomCursor(BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB), Point(0, 0), "hidden")
    )
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun PlayerScreen(target: PlayerTarget) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val window = LocalWindowController.current
    val model = rememberScreenModel(target) { PlayerModel(container, target) }
    val manager = container.playerManager

    val state by model.playerState.collectAsState()
    val ui by model.ui.collectAsState()
    val volume by manager.volume.collectAsState()
    val tracks by manager.tracks.collectAsState()
    val engineAvailable by manager.engineAvailable.collectAsState()

    var controlsVisible by remember { mutableStateOf(true) }
    var channelPanel by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var interaction by remember { mutableIntStateOf(0) }
    var resizeMode by remember { mutableStateOf(ResizeMode.FIT) }
    var volumeHud by remember { mutableIntStateOf(0) }
    var seekHud by remember { mutableIntStateOf(0) }
    var showResume by remember { mutableStateOf(false) }
    val rootFocus = remember { FocusRequester() }

    val isError = state.status == PlaybackStatus.ERROR || ui.resolveError != null || !engineAvailable

    DisposableEffect(Unit) { onDispose { window.exitFullscreen() } }
    LaunchedEffect(Unit) { runCatching { rootFocus.requestFocus() } }
    LaunchedEffect(controlsVisible, channelPanel, menuOpen) {
        if (!menuOpen) runCatching { rootFocus.requestFocus() }
    }
    LaunchedEffect(controlsVisible, interaction, state.isPlaying, channelPanel, menuOpen, isError) {
        if (controlsVisible && state.isPlaying && !channelPanel && !menuOpen && !isError) {
            delay(3_500)
            controlsVisible = false
        }
    }
    LaunchedEffect(volumeHud) { if (volumeHud > 0) { delay(1_400); volumeHud = 0 } }
    LaunchedEffect(seekHud) { if (seekHud != 0) { delay(800); seekHud = 0 } }
    LaunchedEffect(ui.resumedFromMs) {
        if (ui.resumedFromMs != null) { showResume = true; delay(4_000); showResume = false }
    }

    fun show() {
        controlsVisible = true
        interaction++
    }

    fun changeVolume(delta: Int) {
        manager.changeVolume(delta)
        volumeHud++
        show()
    }

    fun seek(deltaSeconds: Int) {
        if (!state.canSeek) return
        manager.seekBy(deltaSeconds * 1000L)
        seekHud = deltaSeconds
        show()
    }

    fun back() {
        when {
            channelPanel -> channelPanel = false
            window.isFullscreen -> window.exitFullscreen()
            else -> navigator.back()
        }
    }

    fun handleKey(event: KeyEvent): Boolean {
        if (event.type != KeyEventType.KeyDown) return false
        show()
        when (event.key) {
            Key.Spacebar, Key.K, Key.MediaPlayPause, Key.MediaPlay, Key.MediaPause -> manager.togglePlayPause()
            Key.DirectionLeft -> if (event.isCtrlPressed) seek(-60) else seek(-10)
            Key.DirectionRight -> if (event.isCtrlPressed) seek(60) else seek(10)
            Key.J -> seek(-10)
            Key.L -> if (ui.isLive) channelPanel = !channelPanel else seek(10)
            Key.DirectionUp -> if (event.isCtrlPressed && ui.isLive) model.zap(-1) else changeVolume(5)
            Key.DirectionDown -> if (event.isCtrlPressed && ui.isLive) model.zap(+1) else changeVolume(-5)
            Key.PageUp, Key.ChannelUp -> if (ui.isLive) model.zap(-1) else if (ui.hasPreviousEpisode) model.previousEpisode()
            Key.PageDown, Key.ChannelDown -> if (ui.isLive) model.zap(+1) else if (ui.hasNextEpisode) model.nextEpisode()
            Key.MediaNext, Key.N -> if (ui.isLive) model.zap(+1) else if (ui.hasNextEpisode) model.nextEpisode()
            Key.MediaPrevious, Key.P -> if (ui.isLive) model.zap(-1) else if (ui.hasPreviousEpisode) model.previousEpisode()
            Key.M -> manager.toggleMute()
            Key.F, Key.F11 -> window.toggleFullscreen()
            Key.A -> resizeMode = resizeMode.next()
            Key.Escape, Key.Backspace -> back()
            Key.Enter, Key.NumPadEnter -> if (isError) model.retry() else window.toggleFullscreen()
            else -> return false
        }
        return true
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .onPreviewKeyEvent(::handleKey)
            .focusRequester(rootFocus)
            .focusable()
            .pointerHoverIcon(if (controlsVisible || isError || channelPanel) PointerIcon.Default else hiddenCursor)
            .onPointerEvent(PointerEventType.Move) { show() }
            .onPointerEvent(PointerEventType.Scroll) { event ->
                val dy = event.changes.firstOrNull()?.scrollDelta?.y ?: 0f
                if (dy != 0f) changeVolume(if (dy < 0) 5 else -5)
            }
    ) {
        VideoSurface(manager.sink, resizeMode)

        // Click: play/pause · double click: fullscreen.
        Box(
            Modifier.fillMaxSize().pointerInput(Unit) {
                detectTapGestures(
                    onTap = { manager.togglePlayPause(); show() },
                    onDoubleTap = { window.toggleFullscreen() }
                )
            }
        )

        StatusSpinner(
            visible = !isError && (ui.isResolving || state.status == PlaybackStatus.PREPARING ||
                state.status == PlaybackStatus.BUFFERING || state.status == PlaybackStatus.RECONNECTING),
            modifier = Modifier.align(Alignment.Center),
            percent = state.bufferPercent.takeIf { state.status == PlaybackStatus.BUFFERING }
        )
        ReconnectingBanner(state, Modifier.align(Alignment.TopCenter))
        SlowNetworkBanner(state.slowNetworkAdaptations, Modifier.align(Alignment.TopCenter))
        ZappingOverlay(ui.zappingChannel, Modifier.align(Alignment.TopStart))
        SeekHud(seekHud, Modifier.align(Alignment.Center))
        VolumeHud(if (volumeHud > 0) volume else null, state.isMuted, Modifier.align(Alignment.CenterEnd))
        ResumeHint(showResume && !controlsVisible, ui.resumedFromMs, Modifier.align(Alignment.BottomStart))

        AnimatedVisibility(
            visible = (controlsVisible || !state.isPlaying) && !isError,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            PlayerControls(
                state = state,
                ui = ui,
                volume = volume,
                tracks = tracks,
                resizeMode = resizeMode,
                isFullscreen = window.isFullscreen,
                onInteraction = { interaction++ },
                onMenuOpenChange = { menuOpen = it },
                onBack = ::back,
                onTogglePlay = { manager.togglePlayPause() },
                onSeekBy = { seek(it) },
                onSeekTo = { manager.seekTo(it) },
                onPreviousChannel = { model.zap(-1) },
                onNextChannel = { model.zap(+1) },
                onOpenChannels = { channelPanel = true },
                onPreviousEpisode = model::previousEpisode,
                onNextEpisode = model::nextEpisode,
                onVolume = { manager.setVolume(it) },
                onToggleMute = { manager.toggleMute() },
                onSelectAudio = { manager.selectAudioTrack(it) },
                onSelectSubtitle = { manager.selectSubtitle(it) },
                onResize = { resizeMode = it },
                onToggleFullscreen = { window.toggleFullscreen() }
            )
        }

        AnimatedVisibility(
            visible = channelPanel,
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
            modifier = Modifier.align(Alignment.CenterEnd)
        ) {
            ChannelPanel(
                channels = ui.channels,
                currentChannelId = ui.currentChannelId,
                onSelect = {
                    model.selectChannel(it)
                    channelPanel = false
                },
                onClose = { channelPanel = false }
            )
        }

        if (isError) {
            val message = when {
                !engineAvailable -> S.ENGINE_MISSING
                ui.resolveError != null -> S.error(ui.resolveError!!)
                else -> state.error?.let(S::playerError).orEmpty()
            }
            PlayerErrorOverlay(
                message = message,
                onRetry = model::retry,
                onBack = { navigator.back() },
                onOpenChannels = if (ui.isLive && ui.channels.size > 1) ({ channelPanel = true }) else null
            )
        }
    }
}
