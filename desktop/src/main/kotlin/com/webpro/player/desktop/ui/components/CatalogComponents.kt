package com.webpro.player.desktop.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.LiveTv
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.S
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.theme.WebProColors
import java.util.Locale

object Dimens {
    val ScreenPadding = 28.dp
    val PosterMinWidth = 160.dp
    val SidebarWidth = 270.dp
}

/** Poster card for movies and series; right click toggles the favorite. */
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
    onToggleFavorite: (() -> Unit)? = null,
    fallbackIcon: ImageVector = Icons.Rounded.Movie
) {
    FocusableCard(
        onClick = onClick,
        onLongClick = onToggleFavorite,
        modifier = modifier.fillMaxWidth().onSecondaryClick(onToggleFavorite)
    ) { focused ->
        Column {
            Box {
                RemoteImage(
                    url = imageUrl,
                    contentDescription = title,
                    fallbackText = title,
                    fallbackIcon = if (imageUrl.isNullOrBlank()) fallbackIcon else null,
                    modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f)
                )
                Row(Modifier.align(Alignment.TopStart).fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    if (rating != null && rating > 0) {
                        Text(
                            String.format(Locale.ROOT, "%.1f", rating),
                            style = MaterialTheme.typography.labelSmall,
                            color = WebProColors.TextPrimary,
                            modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(WebProColors.Scrim)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    } else Box(Modifier)
                    if (isFavorite) {
                        Box(Modifier.size(24.dp).clip(CircleShape).background(WebProColors.Scrim), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.Star, null, tint = WebProColors.Favorite, modifier = Modifier.size(16.dp))
                        }
                    }
                }
                if (progress != null && progress > 0f) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(6.dp),
                        color = WebProColors.Primary,
                        trackColor = WebProColors.Scrim
                    )
                }
            }
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    color = if (focused) WebProColors.TextPrimary else WebProColors.TextPrimary.copy(alpha = 0.9f),
                    maxLines = 2,
                    minLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary, maxLines = 1)
                }
            }
        }
    }
}

@Composable
fun ChannelRow(
    channel: LiveChannel,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier,
    isCurrent: Boolean = false
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        FocusableCard(
            onClick = onClick,
            focusedScale = 1.01f,
            modifier = Modifier.weight(1f).onSecondaryClick(onToggleFavorite),
            containerColor = if (isCurrent) WebProColors.SurfaceHighest else MaterialTheme.colorScheme.surface
        ) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                if (channel.number > 0) {
                    Text(channel.number.toString(), style = MaterialTheme.typography.labelLarge, color = WebProColors.TextMuted,
                        modifier = Modifier.width(48.dp), maxLines = 1)
                }
                RemoteImage(
                    url = channel.logoUrl,
                    contentDescription = channel.name,
                    contentScale = ContentScale.Fit,
                    fallbackIcon = Icons.Rounded.LiveTv,
                    maxSize = 160,
                    modifier = Modifier.size(width = 64.dp, height = 42.dp).clip(MaterialTheme.shapes.small)
                )
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        channel.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.SemiBold,
                        color = if (isCurrent) WebProColors.Primary else WebProColors.TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (isCurrent) Text(S.NOW_PLAYING, style = MaterialTheme.typography.labelSmall, color = WebProColors.Live)
                }
            }
        }
        IconButton(onClick = onToggleFavorite) {
            Icon(
                if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                contentDescription = if (isFavorite) S.REMOVE_FAVORITE else S.ADD_FAVORITE,
                tint = if (isFavorite) WebProColors.Favorite else WebProColors.TextMuted
            )
        }
    }
}

fun categoryLabel(category: Category): String = when (category.id) {
    Category.ALL_ID -> S.ALL
    Category.FAVORITES_ID -> S.FAVORITES_CATEGORY
    else -> category.name
}

@Composable
fun CategorySidebar(categories: List<Category>, selectedId: String, onSelect: (Category) -> Unit, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    LaunchedEffect(categories) {
        val index = categories.indexOfFirst { it.id == selectedId }
        if (index > 0) listState.scrollToItem(index)
    }
    LazyColumn(state = listState, modifier = modifier, contentPadding = PaddingValues(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        items(categories, key = { it.id }) { category ->
            val selected = category.id == selectedId
            FocusableCard(
                onClick = { onSelect(category) },
                focusedScale = 1.02f,
                shape = MaterialTheme.shapes.small,
                containerColor = if (selected) WebProColors.Primary.copy(alpha = 0.24f) else Color.Transparent,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    categoryLabel(category),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    color = if (selected) WebProColors.TextPrimary else WebProColors.TextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp)
                )
            }
        }
    }
}

@Composable
fun SearchField(value: String, onValueChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.widthIn(max = 720.dp).fillMaxWidth(),
        singleLine = true,
        placeholder = { Text(placeholder, color = WebProColors.TextMuted) },
        leadingIcon = { Icon(Icons.Rounded.Search, null, tint = WebProColors.TextSecondary) },
        trailingIcon = {
            if (value.isNotEmpty()) IconButton(onClick = { onValueChange("") }) { Icon(Icons.Rounded.Close, S.CLEAR) }
        },
        shape = MaterialTheme.shapes.medium,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = WebProColors.Primary,
            unfocusedBorderColor = WebProColors.Outline,
            focusedContainerColor = WebProColors.Surface,
            unfocusedContainerColor = WebProColors.Surface
        )
    )
}

@Composable
fun DetailBackdrop(imageUrl: String?, height: Dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(height)) {
        if (!imageUrl.isNullOrBlank()) {
            RemoteImage(imageUrl, null, Modifier.fillMaxSize().alpha(0.3f), maxSize = 1280)
        }
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color.Transparent, WebProColors.Background.copy(alpha = 0.75f), WebProColors.Background))
            )
        )
    }
}

@Composable
fun MetadataRow(year: String?, genre: String?, duration: String?, rating: Double?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        val parts = listOfNotNull(year, genre?.takeIf { it.isNotBlank() }, duration)
        parts.forEachIndexed { index, part ->
            if (index > 0) Text("  •  ", color = WebProColors.TextMuted)
            Text(part, color = WebProColors.TextSecondary, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        }
        if (rating != null && rating > 0) {
            if (parts.isNotEmpty()) Spacer(Modifier.width(12.dp))
            Row(
                Modifier.clip(MaterialTheme.shapes.small).background(WebProColors.Favorite.copy(alpha = 0.15f))
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Rounded.Star, null, tint = WebProColors.Favorite, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(String.format(Locale.ROOT, "%.1f", rating), color = WebProColors.Favorite, fontWeight = FontWeight.Bold)
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

