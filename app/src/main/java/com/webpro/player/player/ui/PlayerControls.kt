package com.webpro.player.player.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.VolumeDown
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.AspectRatio
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.ScreenRotation
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import com.webpro.player.R
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerState
import com.webpro.player.player.PlayerUiState
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

/** On-screen controls. Every button is focusable and usable with DPAD or touch. */
@Composable
fun PlayerControls(
    state: PlayerState,
    ui: PlayerUiState,
    isTv: Boolean,
    playFocusRequester: FocusRequester,
    resizeOption: ResizeOption,
    landscapeLocked: Boolean,
    onInteraction: () -> Unit,
    onHide: () -> Unit,
    onBack: () -> Unit,
    onTogglePlay: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onSeekTo: (Long) -> Unit,
    onPreviousChannel: () -> Unit,
    onNextChannel: () -> Unit,
    onOpenChannels: () -> Unit,
    onPreviousEpisode: () -> Unit,
    onNextEpisode: () -> Unit,
    onVolumeDown: () -> Unit,
    onVolumeUp: () -> Unit,
    onToggleMute: () -> Unit,
    onCycleResize: () -> Unit,
    onToggleOrientation: (() -> Unit)?
) {
    val bigButton: Dp = if (isTv) 76.dp else 64.dp
    val smallButton: Dp = if (isTv) 52.dp else 46.dp
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.75f),
                    0.25f to Color.Transparent,
                    0.6f to Color.Transparent,
                    1f to Color.Black.copy(alpha = 0.85f)
                )
            )
            .pointerInput(Unit) { detectTapGestures(onTap = { onHide() }) }
    ) {
        // ---------------------------------------------------------- top bar
        Row(
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .padding(horizontal = if (isTv) 40.dp else 16.dp, vertical = if (isTv) 28.dp else 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ControlButton(
                icon = Icons.AutoMirrored.Rounded.ArrowBack,
                description = stringResource(R.string.action_back),
                size = smallButton,
                onClick = onBack
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = ui.title,
                    style = if (isTv) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (!ui.subtitle.isNullOrBlank()) {
                    Text(
                        text = ui.subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = WebProColors.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (ui.isLive) LiveBadge()
        }

        // ---------------------------------------------------------- center controls
        Row(
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(if (isTv) 36.dp else 28.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (ui.isLive) {
                ControlButton(
                    icon = Icons.Rounded.SkipPrevious,
                    description = stringResource(R.string.player_previous_channel),
                    size = smallButton + 6.dp,
                    enabled = ui.channels.size > 1,
                    onClick = onPreviousChannel
                )
            } else {
                ControlButton(
                    icon = Icons.Rounded.Replay10,
                    description = stringResource(R.string.player_rewind),
                    size = smallButton + 6.dp,
                    enabled = state.canSeek,
                    onClick = { onSeekBy(-10_000L) }
                )
            }
            ControlButton(
                icon = when {
                    state.status == PlaybackStatus.ENDED -> Icons.Rounded.Replay
                    state.isPlaying || state.isLoading -> Icons.Rounded.Pause
                    else -> Icons.Rounded.PlayArrow
                },
                description = stringResource(if (state.isPlaying) R.string.player_pause else R.string.player_play),
                size = bigButton,
                primary = true,
                modifier = Modifier.focusRequester(playFocusRequester),
                onClick = onTogglePlay
            )
            if (ui.isLive) {
                ControlButton(
                    icon = Icons.Rounded.SkipNext,
                    description = stringResource(R.string.player_next_channel),
                    size = smallButton + 6.dp,
                    enabled = ui.channels.size > 1,
                    onClick = onNextChannel
                )
            } else {
                ControlButton(
                    icon = Icons.Rounded.Forward10,
                    description = stringResource(R.string.player_forward),
                    size = smallButton + 6.dp,
                    enabled = state.canSeek,
                    onClick = { onSeekBy(10_000L) }
                )
            }
        }

        // ---------------------------------------------------------- bottom area
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = if (isTv) 40.dp else 16.dp, vertical = if (isTv) 28.dp else 12.dp)
        ) {
            if (state.canSeek) {
                SeekBar(state = state, onSeekTo = onSeekTo, onSeekBy = onSeekBy, onInteraction = onInteraction)
                Spacer(Modifier.size(6.dp))
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ControlButton(
                    icon = Icons.AutoMirrored.Rounded.VolumeDown,
                    description = stringResource(R.string.player_volume_down),
                    size = smallButton,
                    onClick = onVolumeDown
                )
                ControlButton(
                    icon = Icons.AutoMirrored.Rounded.VolumeOff,
                    description = stringResource(R.string.player_mute),
                    size = smallButton,
                    onClick = onToggleMute
                )
                ControlButton(
                    icon = Icons.AutoMirrored.Rounded.VolumeUp,
                    description = stringResource(R.string.player_volume_up),
                    size = smallButton,
                    onClick = onVolumeUp
                )
                Spacer(Modifier.weight(1f))
                if (ui.isLive && ui.channels.size > 1) {
                    ControlButton(
                        icon = Icons.AutoMirrored.Rounded.List,
                        description = stringResource(R.string.player_channel_list),
                        size = smallButton,
                        onClick = onOpenChannels
                    )
                }
                if (ui.hasPreviousEpisode) {
                    ControlButton(
                        icon = Icons.Rounded.SkipPrevious,
                        description = stringResource(R.string.player_previous_episode),
                        size = smallButton,
                        onClick = onPreviousEpisode
                    )
                }
                if (ui.hasNextEpisode) {
                    ControlButton(
                        icon = Icons.Rounded.SkipNext,
                        description = stringResource(R.string.player_next_episode),
                        size = smallButton,
                        onClick = onNextEpisode
                    )
                }
                ControlButton(
                    icon = Icons.Rounded.AspectRatio,
                    description = stringResource(
                        when (resizeOption) {
                            ResizeOption.FIT -> R.string.player_resize_fit
                            ResizeOption.ZOOM -> R.string.player_resize_zoom
                            ResizeOption.FILL -> R.string.player_resize_fill
                        }
                    ),
                    size = smallButton,
                    onClick = onCycleResize
                )
                if (onToggleOrientation != null) {
                    ControlButton(
                        icon = Icons.Rounded.ScreenRotation,
                        description = stringResource(
                            if (landscapeLocked) R.string.player_unlock_rotation else R.string.player_lock_landscape
                        ),
                        size = smallButton,
                        onClick = onToggleOrientation
                    )
                }
            }
        }
    }
}

@Composable
private fun SeekBar(
    state: PlayerState,
    onSeekTo: (Long) -> Unit,
    onSeekBy: (Long) -> Unit,
    onInteraction: () -> Unit
) {
    var dragPosition by remember { mutableStateOf<Float?>(null) }
    val duration = state.durationMs.coerceAtLeast(1L).toFloat()
    val shownPosition = dragPosition ?: state.positionMs.toFloat()
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            TimeFormat.playback(shownPosition.toLong()),
            style = MaterialTheme.typography.labelLarge,
            color = Color.White
        )
        Slider(
            value = shownPosition.coerceIn(0f, duration),
            onValueChange = {
                dragPosition = it
                onInteraction()
            },
            onValueChangeFinished = {
                dragPosition?.let { onSeekTo(it.toLong()) }
                dragPosition = null
            },
            valueRange = 0f..duration,
            interactionSource = interactionSource,
            colors = SliderDefaults.colors(
                thumbColor = if (focused) WebProColors.Accent else WebProColors.Primary,
                activeTrackColor = WebProColors.Primary,
                inactiveTrackColor = Color.White.copy(alpha = 0.25f)
            ),
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp)
                .onPreviewKeyEvent { event ->
                    // DPAD left/right on the focused bar seek in 10 s steps.
                    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                    when (event.key) {
                        Key.DirectionLeft -> { onSeekBy(-10_000L); true }
                        Key.DirectionRight -> { onSeekBy(10_000L); true }
                        else -> false
                    }
                }
        )
        Text(
            TimeFormat.playback(state.durationMs),
            style = MaterialTheme.typography.labelLarge,
            color = WebProColors.TextSecondary
        )
    }
}

@Composable
private fun LiveBadge() {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(WebProColors.Live)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(Color.White)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            stringResource(R.string.player_live),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
    }
}

/** Round icon button with a clear focus ring for TV remotes. */
@Composable
fun ControlButton(
    icon: ImageVector,
    description: String,
    size: Dp,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    primary: Boolean = false
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val background by animateColorAsState(
        when {
            focused -> WebProColors.Primary
            primary -> Color.White.copy(alpha = 0.22f)
            else -> Color.Black.copy(alpha = 0.35f)
        },
        label = "controlBackground"
    )
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(background)
            .border(2.dp, if (focused) Color.White else Color.Transparent, CircleShape)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = description,
            tint = if (enabled) Color.White else Color.White.copy(alpha = 0.35f),
            modifier = Modifier.size(size * 0.55f)
        )
    }
}
