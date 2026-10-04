package com.webpro.player.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.R
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.ui.theme.WebProColors

/**
 * Channel row: the main card plays the channel and the star button (a separate
 * focus target, reachable with DPAD_RIGHT on TV) toggles the favorite.
 */
@Composable
fun ChannelRow(
    channel: LiveChannel,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier,
    isCurrent: Boolean = false
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        FocusableCard(
            onClick = onClick,
            onLongClick = onToggleFavorite,
            focusedScale = 1.02f,
            modifier = Modifier.weight(1f),
            containerColor = if (isCurrent) WebProColors.SurfaceHighest else MaterialTheme.colorScheme.surface
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (channel.number > 0) {
                    Text(
                        text = channel.number.toString(),
                        style = MaterialTheme.typography.labelLarge,
                        color = WebProColors.TextMuted,
                        modifier = Modifier.width(44.dp),
                        maxLines = 1
                    )
                }
                RemoteImage(
                    url = channel.logoUrl,
                    contentDescription = channel.name,
                    contentScale = ContentScale.Fit,
                    fallbackIcon = Icons.Rounded.LiveTv,
                    modifier = Modifier
                        .size(width = 64.dp, height = 44.dp)
                        .clip(MaterialTheme.shapes.small)
                )
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = channel.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (isCurrent) WebProColors.Primary else WebProColors.TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (isCurrent) {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = stringResource(R.string.live_now_playing),
                            style = MaterialTheme.typography.labelSmall,
                            color = WebProColors.Live
                        )
                    }
                }
            }
        }
        IconButton(onClick = onToggleFavorite) {
            Icon(
                imageVector = if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                contentDescription = stringResource(
                    if (isFavorite) R.string.action_remove_favorite else R.string.action_add_favorite
                ),
                tint = if (isFavorite) WebProColors.Favorite else WebProColors.TextMuted
            )
        }
    }
}
