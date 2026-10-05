package com.webpro.player.desktop.ui.components

import androidx.compose.foundation.Image
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webpro.player.ui.theme.WebProColors

val LocalImageLoader = staticCompositionLocalOf<ImageLoader> { error("ImageLoader not provided") }

/** Network image with a branded fallback (initials or icon) while loading or when broken. */
@Composable
fun RemoteImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbackText: String? = null,
    fallbackIcon: ImageVector? = null,
    maxSize: Int = 480
) {
    val loader = LocalImageLoader.current
    val bitmap by produceState<ImageBitmap?>(url?.let { loader.cached(it, maxSize) }, url, maxSize) {
        if (value == null && !url.isNullOrBlank()) value = loader.load(url, maxSize)
    }
    Box(
        modifier = modifier.background(Brush.linearGradient(listOf(WebProColors.SurfaceHighest, WebProColors.SurfaceRaised))),
        contentAlignment = Alignment.Center
    ) {
        val image = bitmap
        if (image != null) {
            Image(
                bitmap = image,
                contentDescription = contentDescription,
                contentScale = contentScale,
                modifier = Modifier.fillMaxSize()
            )
        } else when {
            fallbackIcon != null -> Icon(fallbackIcon, null, tint = WebProColors.TextMuted, modifier = Modifier.size(36.dp))
            !fallbackText.isNullOrBlank() -> Text(
                text = initials(fallbackText),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = WebProColors.TextSecondary,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.padding(6.dp)
            )
        }
    }
}

private fun initials(text: String): String = text
    .split(' ', '-', '_', '|', ':')
    .filter { it.isNotBlank() && it.first().isLetterOrDigit() }
    .take(2)
    .joinToString("") { it.first().uppercase() }
    .ifEmpty { text.take(1).uppercase() }
