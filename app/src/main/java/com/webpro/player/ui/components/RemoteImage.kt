package com.webpro.player.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.webpro.player.ui.theme.WebProColors

/** Network image with a branded fallback (initials or icon) when missing or broken. */
@Composable
fun RemoteImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbackText: String? = null,
    fallbackIcon: ImageVector? = null
) {
    var failed by remember(url) { mutableStateOf(url.isNullOrBlank()) }
    Box(
        modifier = modifier.background(
            Brush.linearGradient(listOf(WebProColors.SurfaceHighest, WebProColors.SurfaceRaised))
        ),
        contentAlignment = Alignment.Center
    ) {
        if (failed) {
            when {
                fallbackIcon != null -> Icon(
                    imageVector = fallbackIcon,
                    contentDescription = null,
                    tint = WebProColors.TextMuted,
                    modifier = Modifier.size(36.dp)
                )
                !fallbackText.isNullOrBlank() -> Text(
                    text = initials(fallbackText),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = WebProColors.TextSecondary,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Clip,
                    modifier = Modifier.padding(6.dp)
                )
            }
        } else {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(url)
                    .crossfade(true)
                    .build(),
                contentDescription = contentDescription,
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize(),
                onError = { failed = true }
            )
        }
    }
}

private fun initials(text: String): String = text
    .split(' ', '-', '_', '|', ':')
    .filter { part -> part.isNotBlank() && part.first().isLetterOrDigit() }
    .take(2)
    .joinToString("") { it.first().uppercase() }
    .ifEmpty { text.take(1).uppercase() }
