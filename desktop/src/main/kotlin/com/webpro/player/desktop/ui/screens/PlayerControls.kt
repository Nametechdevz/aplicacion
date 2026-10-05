package com.webpro.player.desktop.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
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
import androidx.compose.material.icons.rounded.Audiotrack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ClosedCaption
import androidx.compose.material.icons.rounded.Forward10
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.FullscreenExit
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.player.TrackOption
import com.webpro.player.desktop.player.TrackState
import com.webpro.player.desktop.storage.FileSettingsRepository
import com.webpro.player.desktop.ui.S
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerState
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

@Composable
fun PlayerControls(
    state: PlayerState,
    ui: PlayerUiState,
    volume: Int,
    tracks: TrackState,
    resizeMode: ResizeMode,
    isFullscreen: Boolean,
    onInteraction: () -> Unit,
    onMenuOpenChange: (Boolean) -> Unit,
    onBack: () -> Unit,
    onTogglePlay: () -> Unit,
    onSeekBy: (Int) -> Unit,
    onSeekTo: (Long) -> Unit,
    onPreviousChannel: () -> Unit,
    onNextChannel: () -> Unit,
    onOpenChannels: () -> Unit,
    onPreviousEpisode: () -> Unit,
    onNextEpisode: () -> Unit,
    onVolume: (Int) -> Unit,
    onToggleMute: () -> Unit,
    onSelectAudio: (Int) -> Unit,
    onSelectSubtitle: (Int) -> Unit,
    onResize: (ResizeMode) -> Unit,
    onToggleFullscreen: () -> Unit
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    0f to Color.Black.copy(alpha = 0.7f),
                    0.18f to Color.Transparent,
                    0.7f to Color.Transparent,
                    1f to Color.Black.copy(alpha = 0.85f)
                )
            )
    ) {
        // ------------------------------------------------ top bar
        Row(
            Modifier.align(Alignment.TopStart).fillMaxWidth().padding(horizontal = 24.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ControlButton(Icons.AutoMirrored.Rounded.ArrowBack, S.BACK, 44.dp, onBack)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(ui.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!ui.subtitle.isNullOrBlank()) {
                    Text(ui.subtitle, style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextSecondary, maxLines = 1)
                }
            }
            Text(S.SHORTCUTS, style = MaterialTheme.typography.labelSmall, color = Color.White.copy(alpha = 0.55f))
        }

        // ------------------------------------------------ bottom bar
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp)) {
            if (state.canSeek) {
                SeekBar(state, onSeekTo, onInteraction)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (ui.isLive) {
                    ControlButton(Icons.Rounded.SkipPrevious, S.PREV_CHANNEL, 44.dp, onPreviousChannel, enabled = ui.channels.size > 1)
                } else if (ui.hasPreviousEpisode) {
                    ControlButton(Icons.Rounded.SkipPrevious, S.PREV_EPISODE, 44.dp, onPreviousEpisode)
                }
                if (!ui.isLive) ControlButton(Icons.Rounded.Replay10, S.REWIND, 44.dp, { onSeekBy(-10) }, enabled = state.canSeek)
                ControlButton(
                    when {
                        state.status == PlaybackStatus.ENDED -> Icons.Rounded.Replay
                        state.isPlaying || state.isLoading -> Icons.Rounded.Pause
                        else -> Icons.Rounded.PlayArrow
                    },
                    if (state.isPlaying) S.PAUSE else S.PLAY,
                    56.dp,
                    onTogglePlay,
                    primary = true
                )
                if (!ui.isLive) ControlButton(Icons.Rounded.Forward10, S.FORWARD, 44.dp, { onSeekBy(10) }, enabled = state.canSeek)
                if (ui.isLive) {
                    ControlButton(Icons.Rounded.SkipNext, S.NEXT_CHANNEL, 44.dp, onNextChannel, enabled = ui.channels.size > 1)
                } else if (ui.hasNextEpisode) {
                    ControlButton(Icons.Rounded.SkipNext, S.NEXT_EPISODE, 44.dp, onNextEpisode)
                }

                Spacer(Modifier.width(8.dp))
                ControlButton(
                    when {
                        state.isMuted || volume == 0 -> Icons.AutoMirrored.Rounded.VolumeOff
                        volume < 50 -> Icons.AutoMirrored.Rounded.VolumeDown
                        else -> Icons.AutoMirrored.Rounded.VolumeUp
                    },
                    S.MUTE,
                    40.dp,
                    onToggleMute
                )
                Slider(
                    value = if (state.isMuted) 0f else volume.toFloat(),
                    onValueChange = { onVolume(it.toInt()); onInteraction() },
                    valueRange = 0f..FileSettingsRepository.MAX_VOLUME.toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor = Color.White,
                        activeTrackColor = if (volume > 100) WebProColors.Favorite else WebProColors.Primary,
                        inactiveTrackColor = Color.White.copy(alpha = 0.25f)
                    ),
                    modifier = Modifier.width(140.dp)
                )
                Text("$volume%", style = MaterialTheme.typography.labelLarge, color = Color.White, modifier = Modifier.width(44.dp))

                Spacer(Modifier.weight(1f))

                if (ui.isLive) LiveBadge()
                else if (state.durationMs > 0) {
                    Text(
                        "${TimeFormat.playback(state.positionMs)} / ${TimeFormat.playback(state.durationMs)}",
                        style = MaterialTheme.typography.labelLarge,
                        color = Color.White
                    )
                }
                Spacer(Modifier.width(8.dp))

                TrackMenu(
                    icon = Icons.Rounded.Audiotrack,
                    label = S.AUDIO_TRACK,
                    options = tracks.audio,
                    selected = tracks.selectedAudio,
                    emptyText = S.NO_AUDIO_TRACKS,
                    onSelect = onSelectAudio,
                    onOpenChange = onMenuOpenChange
                )
                if (tracks.subtitles.size > 1) {
                    TrackMenu(
                        icon = Icons.Rounded.ClosedCaption,
                        label = S.SUBTITLES,
                        options = tracks.subtitles,
                        selected = tracks.selectedSubtitle,
                        emptyText = "",
                        onSelect = onSelectSubtitle,
                        onOpenChange = onMenuOpenChange
                    )
                }
                AspectMenu(resizeMode, onResize, onMenuOpenChange)
                if (ui.isLive && ui.channels.size > 1) {
                    ControlButton(Icons.AutoMirrored.Rounded.List, S.CHANNEL_LIST, 40.dp, onOpenChannels)
                }
                ControlButton(
                    if (isFullscreen) Icons.Rounded.FullscreenExit else Icons.Rounded.Fullscreen,
                    if (isFullscreen) S.EXIT_FULLSCREEN else S.FULLSCREEN,
                    40.dp,
                    onToggleFullscreen
                )
            }
        }
    }
}

@Composable
private fun SeekBar(state: PlayerState, onSeekTo: (Long) -> Unit, onInteraction: () -> Unit) {
    var dragging by remember { mutableStateOf<Float?>(null) }
    val duration = state.durationMs.coerceAtLeast(1L).toFloat()
    Slider(
        value = (dragging ?: state.positionMs.toFloat()).coerceIn(0f, duration),
        onValueChange = { dragging = it; onInteraction() },
        onValueChangeFinished = {
            dragging?.let { onSeekTo(it.toLong()) }
            dragging = null
        },
        valueRange = 0f..duration,
        colors = SliderDefaults.colors(
            thumbColor = WebProColors.Primary,
            activeTrackColor = WebProColors.Primary,
            inactiveTrackColor = Color.White.copy(alpha = 0.25f)
        ),
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun TrackMenu(
    icon: ImageVector,
    label: String,
    options: List<TrackOption>,
    selected: Int,
    emptyText: String,
    onSelect: (Int) -> Unit,
    onOpenChange: (Boolean) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Box {
        ControlButton(icon, label, 40.dp, { open = true; onOpenChange(true) })
        DropdownMenu(expanded = open, onDismissRequest = { open = false; onOpenChange(false) }) {
            Text(label, style = MaterialTheme.typography.labelLarge, color = WebProColors.TextMuted, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
            if (options.isEmpty()) {
                DropdownMenuItem(text = { Text(emptyText) }, onClick = { open = false; onOpenChange(false) }, enabled = false)
            }
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.name) },
                    leadingIcon = {
                        if (option.id == selected) Icon(Icons.Rounded.Check, null, tint = WebProColors.Primary)
                        else Spacer(Modifier.size(24.dp))
                    },
                    onClick = {
                        onSelect(option.id)
                        open = false
                        onOpenChange(false)
                    }
                )
            }
        }
    }
}

@Composable
private fun AspectMenu(mode: ResizeMode, onResize: (ResizeMode) -> Unit, onOpenChange: (Boolean) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        ControlButton(Icons.Rounded.AspectRatio, S.ASPECT, 40.dp, { open = true; onOpenChange(true) })
        DropdownMenu(expanded = open, onDismissRequest = { open = false; onOpenChange(false) }) {
            ResizeMode.entries.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label) },
                    leadingIcon = {
                        if (option == mode) Icon(Icons.Rounded.Check, null, tint = WebProColors.Primary) else Spacer(Modifier.size(24.dp))
                    },
                    onClick = { onResize(option); open = false; onOpenChange(false) }
                )
            }
        }
    }
}

@Composable
private fun LiveBadge() {
    Row(
        Modifier.clip(RoundedCornerShape(8.dp)).background(WebProColors.Live).padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(Color.White))
        Spacer(Modifier.width(6.dp))
        Text(S.LIVE_BADGE, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = Color.White)
    }
}

/** Round button with hover feedback and a tooltip. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun ControlButton(
    icon: ImageVector,
    description: String,
    size: Dp,
    onClick: () -> Unit,
    enabled: Boolean = true,
    primary: Boolean = false
) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val background by animateColorAsState(
        when {
            hovered && enabled -> WebProColors.Primary
            primary -> Color.White.copy(alpha = 0.22f)
            else -> Color.Black.copy(alpha = 0.35f)
        },
        label = "controlBg"
    )
    TooltipBox(
        positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(description) } },
        state = rememberTooltipState()
    ) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(background)
                .hoverable(interaction)
                .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, description, tint = if (enabled) Color.White else Color.White.copy(alpha = 0.35f), modifier = Modifier.size(size * 0.55f))
        }
    }
}
