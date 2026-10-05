package com.webpro.player.player.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.NetworkCheck
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.R
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerState
import com.webpro.player.ui.components.RemoteImage
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun PlayerStatusOverlay(
    state: PlayerState,
    isResolving: Boolean,
    showSpinner: Boolean,
    modifier: Modifier = Modifier
) {
    val loading = isResolving || state.status == PlaybackStatus.PREPARING ||
        state.status == PlaybackStatus.BUFFERING || state.status == PlaybackStatus.RECONNECTING
    AnimatedVisibility(visible = showSpinner && loading, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        Box(
            modifier = Modifier
                .size(84.dp)
                .clip(CircleShape)
                .background(WebProColors.Scrim),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = WebProColors.Primary, strokeWidth = 4.dp, modifier = Modifier.size(48.dp))
            val percent = state.bufferPercent
            if (percent != null && percent > 0) {
                Text("$percent%", style = MaterialTheme.typography.labelMedium, color = Color.White)
            }
        }
    }
}

/** Shown for a few seconds when the player raised the buffer because the connection is slow. */
@Composable
fun SlowNetworkBanner(adaptations: Int, modifier: Modifier = Modifier) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(adaptations) {
        if (adaptations > 0) {
            visible = true
            delay(6_000)
            visible = false
        }
    }
    AnimatedVisibility(visible = visible, enter = fadeIn(), exit = fadeOut(), modifier = modifier.padding(top = 76.dp)) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(24.dp))
                .background(WebProColors.Scrim)
                .padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.NetworkCheck, contentDescription = null, tint = WebProColors.Favorite)
            Spacer(Modifier.width(10.dp))
            Text(stringResource(R.string.player_slow_network), style = MaterialTheme.typography.labelLarge, color = Color.White)
        }
    }
}

@Composable
fun ReconnectingBanner(state: PlayerState, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = state.status == PlaybackStatus.RECONNECTING,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier.padding(top = 24.dp)
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(24.dp))
                .background(WebProColors.Scrim)
                .padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.Sync, contentDescription = null, tint = WebProColors.Accent)
            Spacer(Modifier.width(10.dp))
            Text(
                text = if (state.retryAttempt > 0) {
                    stringResource(R.string.player_reconnecting_attempt, state.retryAttempt, state.maxRetries)
                } else {
                    stringResource(R.string.player_reconnecting)
                },
                style = MaterialTheme.typography.labelLarge,
                color = Color.White
            )
        }
    }
}

@Composable
fun ZappingOverlay(channel: LiveChannel?, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = channel != null, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        val shown = channel ?: return@AnimatedVisibility
        Row(
            modifier = Modifier
                .padding(32.dp)
                .clip(MaterialTheme.shapes.large)
                .background(WebProColors.Scrim)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RemoteImage(
                url = shown.logoUrl,
                contentDescription = shown.name,
                fallbackText = shown.name,
                modifier = Modifier
                    .size(width = 84.dp, height = 56.dp)
                    .clip(MaterialTheme.shapes.small)
            )
            Spacer(Modifier.width(16.dp))
            Column {
                if (shown.number > 0) {
                    Text(
                        shown.number.toString(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = WebProColors.Accent,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    shown.name,
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 420.dp)
                )
            }
        }
    }
}

@Composable
fun SeekFeedback(seconds: Float, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = seconds != 0f, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        val value = abs(seconds).roundToInt()
        Text(
            text = if (seconds > 0) "+${value}s" else "-${value}s",
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White,
            modifier = Modifier
                .padding(top = 140.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(WebProColors.Scrim)
                .padding(horizontal = 20.dp, vertical = 10.dp)
        )
    }
}

@Composable
fun VolumeHud(level: Float?, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = level != null, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        val value = level ?: 0f
        Column(
            modifier = Modifier
                .padding(32.dp)
                .clip(MaterialTheme.shapes.large)
                .background(WebProColors.Scrim)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(Icons.AutoMirrored.Rounded.VolumeUp, contentDescription = null, tint = Color.White)
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { value },
                modifier = Modifier.width(120.dp),
                color = WebProColors.Primary,
                trackColor = Color.White.copy(alpha = 0.2f)
            )
            Spacer(Modifier.height(6.dp))
            Text("${(value * 100).roundToInt()}%", style = MaterialTheme.typography.labelLarge, color = Color.White)
        }
    }
}

@Composable
fun ResumeHint(visible: Boolean, positionMs: Long?, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = visible && positionMs != null, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        Text(
            text = stringResource(R.string.player_resumed_from, TimeFormat.playback(positionMs ?: 0L)),
            style = MaterialTheme.typography.labelLarge,
            color = Color.White,
            modifier = Modifier
                .padding(32.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(WebProColors.Scrim)
                .padding(horizontal = 16.dp, vertical = 10.dp)
        )
    }
}

@Composable
fun PlayerErrorOverlay(
    message: String,
    focusRequester: FocusRequester,
    onRetry: () -> Unit,
    onBack: () -> Unit,
    onOpenChannels: (() -> Unit)?
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.82f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .padding(24.dp)
                .widthIn(max = 520.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .background(WebProColors.Error.copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = WebProColors.Error, modifier = Modifier.size(40.dp))
            }
            Spacer(Modifier.height(18.dp))
            Text(
                stringResource(R.string.player_error_title),
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(8.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodyLarge,
                color = WebProColors.TextSecondary,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(24.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.action_back))
                }
                if (onOpenChannels != null) {
                    OutlinedButton(onClick = onOpenChannels) {
                        Icon(Icons.AutoMirrored.Rounded.List, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.player_channel_list))
                    }
                }
                Button(onClick = onRetry, modifier = Modifier.focusRequester(focusRequester)) {
                    Icon(Icons.Rounded.Refresh, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(R.string.action_retry))
                }
            }
        }
    }
    LaunchedEffect(message) {
        delay(100)
        runCatching { focusRequester.requestFocus() }
    }
}
