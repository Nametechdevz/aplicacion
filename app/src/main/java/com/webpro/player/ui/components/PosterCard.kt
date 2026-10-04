package com.webpro.player.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.ui.theme.WebProColors
import java.util.Locale

/** Poster card for movies and series (2:3), with rating, favorite mark and progress. */
@Composable
fun PosterCard(
    title: String,
    imageUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    rating: Double? = null,
    isFavorite: Boolean = false,
    progress: Float? = null,
    onLongClick: (() -> Unit)? = null,
    fallbackIcon: ImageVector = Icons.Rounded.Movie
) {
    FocusableCard(
        onClick = onClick,
        onLongClick = onLongClick,
        modifier = modifier.fillMaxWidth(),
        containerColor = MaterialTheme.colorScheme.surface
    ) { focused ->
        Column {
            Box {
                RemoteImage(
                    url = imageUrl,
                    contentDescription = title,
                    fallbackText = title,
                    fallbackIcon = if (imageUrl.isNullOrBlank()) fallbackIcon else null,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(2f / 3f)
                )
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth()
                        .padding(6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    if (rating != null && rating > 0) {
                        Text(
                            text = String.format(Locale.ROOT, "%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            color = WebProColors.TextPrimary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(WebProColors.Scrim)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    } else {
                        Box(Modifier)
                    }
                    if (isFavorite) {
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(WebProColors.Scrim),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.Star, contentDescription = null, tint = WebProColors.Favorite, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                if (progress != null && progress > 0f) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(6.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = WebProColors.Primary,
                        trackColor = WebProColors.Scrim
                    )
                }
            }
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = if (focused) WebProColors.TextPrimary else WebProColors.TextPrimary.copy(alpha = 0.92f),
                    maxLines = 2,
                    minLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = WebProColors.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
