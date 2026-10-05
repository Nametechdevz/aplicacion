package com.webpro.player.desktop.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.storage.FileSettingsRepository
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.components.RemoteImage
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.player.PlaybackStatus
import com.webpro.player.player.PlayerState
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat
import kotlin.math.abs

@Composable
fun StatusSpinner(visible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible, modifier, enter = fadeIn(), exit = fadeOut()) {
        Box(Modifier.size(88.dp).clip(CircleShape).background(WebProColors.Scrim), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = WebProColors.Primary, strokeWidth = 4.dp, modifier = Modifier.size(50.dp))
        }
    }
}

@Composable
fun ReconnectingBanner(state: PlayerState, modifier: Modifier = Modifier) {
    AnimatedVisibility(state.status == PlaybackStatus.RECONNECTING, modifier.padding(top = 84.dp), enter = fadeIn(), exit = fadeOut()) {
        Row(
            Modifier.clip(RoundedCornerShape(24.dp)).background(WebProColors.Scrim).padding(horizontal = 18.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Rounded.Sync, null, tint = WebProColors.Accent)
            Spacer(Modifier.width(10.dp))
            Text(
                if (state.retryAttempt > 0) S.reconnectingAttempt(state.retryAttempt, state.maxRetries) else S.RECONNECTING,
                color = Color.White,
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

@Composable
fun ZappingOverlay(channel: LiveChannel?, modifier: Modifier = Modifier) {
    AnimatedVisibility(channel != null, modifier, enter = fadeIn(), exit = fadeOut()) {
        val shown = channel ?: return@AnimatedVisibility
        Row(
            Modifier.padding(32.dp).clip(MaterialTheme.shapes.large).background(WebProColors.Scrim).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RemoteImage(shown.logoUrl, shown.name, Modifier.size(width = 88.dp, height = 58.dp).clip(MaterialTheme.shapes.small),
                contentScale = ContentScale.Fit, fallbackIcon = Icons.Rounded.LiveTv, maxSize = 200)
            Spacer(Modifier.width(16.dp))
            Column {
                if (shown.number > 0) Text(shown.number.toString(), style = MaterialTheme.typography.headlineSmall, color = WebProColors.Accent, fontWeight = FontWeight.Bold)
                Text(shown.name, style = MaterialTheme.typography.titleLarge, color = Color.White, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 460.dp))
            }
        }
    }
}

@Composable
fun SeekHud(seconds: Int, modifier: Modifier = Modifier) {
    AnimatedVisibility(seconds != 0, modifier, enter = fadeIn(), exit = fadeOut()) {
        Text(
            (if (seconds > 0) "+" else "-") + "${abs(seconds)} s",
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White,
            modifier = Modifier.padding(top = 160.dp).clip(RoundedCornerShape(16.dp)).background(WebProColors.Scrim)
                .padding(horizontal = 20.dp, vertical = 10.dp)
        )
    }
}

@Composable
fun VolumeHud(volume: Int?, muted: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(volume != null, modifier, enter = fadeIn(), exit = fadeOut()) {
        val value = volume ?: 0
        Column(
            Modifier.padding(32.dp).clip(MaterialTheme.shapes.large).background(WebProColors.Scrim).padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(if (muted || value == 0) Icons.AutoMirrored.Rounded.VolumeOff else Icons.AutoMirrored.Rounded.VolumeUp, null, tint = Color.White)
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { value / FileSettingsRepository.MAX_VOLUME.toFloat() },
                modifier = Modifier.width(130.dp),
                color = if (value > 100) WebProColors.Favorite else WebProColors.Primary,
                trackColor = Color.White.copy(alpha = 0.2f)
            )
            Spacer(Modifier.height(6.dp))
            Text("$value%", color = Color.White, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun ResumeHint(visible: Boolean, positionMs: Long?, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible && positionMs != null, modifier, enter = fadeIn(), exit = fadeOut()) {
        Text(
            S.resumedFrom(TimeFormat.playback(positionMs ?: 0L)),
            color = Color.White,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(32.dp).clip(RoundedCornerShape(12.dp)).background(WebProColors.Scrim)
                .padding(horizontal = 16.dp, vertical = 10.dp)
        )
    }
}

@Composable
fun PlayerErrorOverlay(message: String, onRetry: () -> Unit, onBack: () -> Unit, onOpenChannels: (() -> Unit)?) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)), contentAlignment = Alignment.Center) {
        Column(Modifier.padding(24.dp).widthIn(max = 560.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(80.dp).clip(CircleShape).background(WebProColors.Error.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.ErrorOutline, null, tint = WebProColors.Error, modifier = Modifier.size(42.dp))
            }
            Spacer(Modifier.height(18.dp))
            Text(S.PLAYER_ERROR_TITLE, style = MaterialTheme.typography.headlineSmall, color = Color.White)
            Spacer(Modifier.height(8.dp))
            Text(message, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary, textAlign = TextAlign.Center)
            Spacer(Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, null); Spacer(Modifier.width(6.dp)); Text(S.BACK)
                }
                if (onOpenChannels != null) {
                    OutlinedButton(onClick = onOpenChannels) {
                        Icon(Icons.AutoMirrored.Rounded.List, null); Spacer(Modifier.width(6.dp)); Text(S.CHANNELS)
                    }
                }
                Button(onClick = onRetry) {
                    Icon(Icons.Rounded.Refresh, null); Spacer(Modifier.width(6.dp)); Text(S.RETRY)
                }
            }
        }
    }
}

@Composable
fun ChannelPanel(channels: List<LiveChannel>, currentChannelId: Long?, onSelect: (LiveChannel) -> Unit, onClose: () -> Unit) {
    val listState = rememberLazyListState()
    val current = channels.indexOfFirst { it.streamId == currentChannelId }.coerceAtLeast(0)
    LaunchedEffect(Unit) { listState.scrollToItem((current - 4).coerceAtLeast(0)) }
    Column(Modifier.fillMaxHeight().width(400.dp).background(WebProColors.Background.copy(alpha = 0.95f)).padding(vertical = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(S.CHANNELS, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = onClose) { Icon(Icons.Rounded.Close, S.CLOSE) }
        }
        LazyColumn(state = listState, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            itemsIndexed(channels, key = { _, ch -> ch.streamId }) { _, channel ->
                val isCurrent = channel.streamId == currentChannelId
                FocusableCard(
                    onClick = { onSelect(channel) },
                    focusedScale = 1.01f,
                    shape = MaterialTheme.shapes.small,
                    containerColor = if (isCurrent) WebProColors.Primary.copy(alpha = 0.24f) else WebProColors.Surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (channel.number > 0) channel.number.toString() else "", color = WebProColors.TextMuted, modifier = Modifier.width(44.dp))
                        RemoteImage(channel.logoUrl, null, Modifier.size(width = 52.dp, height = 34.dp).clip(MaterialTheme.shapes.extraSmall),
                            contentScale = ContentScale.Fit, fallbackIcon = Icons.Rounded.LiveTv, maxSize = 160)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            channel.name,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                            color = if (isCurrent) WebProColors.Primary else WebProColors.TextPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}
