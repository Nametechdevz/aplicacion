package com.webpro.player.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webpro.player.ui.theme.WebProColors
import java.util.Locale

/** Blurred-looking backdrop: dimmed image fading into the background color. */
@Composable
fun DetailBackdrop(imageUrl: String?, height: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
    ) {
        if (!imageUrl.isNullOrBlank()) {
            RemoteImage(
                url = imageUrl,
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .alpha(0.35f)
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, WebProColors.Background.copy(alpha = 0.7f), WebProColors.Background)
                    )
                )
        )
    }
}

/** Row of metadata chips: year, genre, duration, rating. */
@Composable
fun MetadataRow(year: String?, genre: String?, duration: String?, rating: Double?, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        val parts = listOfNotNull(year, genre?.takeIf { it.isNotBlank() }, duration)
        parts.forEachIndexed { index, part ->
            if (index > 0) Text("  •  ", color = WebProColors.TextMuted, style = MaterialTheme.typography.bodyMedium)
            Text(part, color = WebProColors.TextSecondary, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        }
        if (rating != null && rating > 0) {
            if (parts.isNotEmpty()) Spacer(Modifier.width(12.dp))
            Row(
                modifier = Modifier
                    .clip(MaterialTheme.shapes.small)
                    .background(WebProColors.Favorite.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Rounded.Star, contentDescription = null, tint = WebProColors.Favorite, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(
                    String.format(Locale.ROOT, "%.1f", rating),
                    color = WebProColors.Favorite,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun LabeledText(label: String, value: String?, modifier: Modifier = Modifier) {
    if (value.isNullOrBlank()) return
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = WebProColors.TextMuted)
        Spacer(Modifier.height(2.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextSecondary)
    }
}
