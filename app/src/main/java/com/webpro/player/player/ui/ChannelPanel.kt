package com.webpro.player.player.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.R
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.components.RemoteImage
import com.webpro.player.ui.theme.WebProColors
import kotlinx.coroutines.delay

/** Side panel to jump to any channel of the current list without leaving the player. */
@Composable
fun ChannelPanel(
    channels: List<LiveChannel>,
    currentChannelId: Long?,
    isTv: Boolean,
    onSelect: (LiveChannel) -> Unit,
    onDismiss: () -> Unit
) {
    val listState = rememberLazyListState()
    val currentIndex = channels.indexOfFirst { it.streamId == currentChannelId }.coerceAtLeast(0)
    val currentFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        listState.scrollToItem((currentIndex - 3).coerceAtLeast(0))
        delay(120)
        runCatching { currentFocus.requestFocus() }
    }

    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(if (isTv) 400.dp else 320.dp)
            .background(WebProColors.Background.copy(alpha = 0.94f))
            .padding(vertical = 16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                stringResource(R.string.player_channel_list),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f)
            )
            if (!isTv) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.action_close))
                }
            }
        }
        Spacer(Modifier.size(8.dp))
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            itemsIndexed(channels, key = { _, channel -> channel.streamId }) { index, channel ->
                val isCurrent = channel.streamId == currentChannelId
                FocusableCard(
                    onClick = { onSelect(channel) },
                    focusedScale = 1.02f,
                    shape = MaterialTheme.shapes.small,
                    containerColor = if (isCurrent) WebProColors.Primary.copy(alpha = 0.22f) else WebProColors.Surface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .then(if (index == currentIndex) Modifier.focusRequester(currentFocus) else Modifier)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = if (channel.number > 0) channel.number.toString() else "",
                            style = MaterialTheme.typography.labelLarge,
                            color = WebProColors.TextMuted,
                            modifier = Modifier.width(40.dp)
                        )
                        RemoteImage(
                            url = channel.logoUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            fallbackIcon = Icons.Rounded.LiveTv,
                            modifier = Modifier
                                .size(width = 52.dp, height = 36.dp)
                                .clip(MaterialTheme.shapes.extraSmall)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = channel.name,
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
