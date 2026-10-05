package com.webpro.player.desktop.ui.screens

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.Section
import com.webpro.player.desktop.ui.components.Dimens
import com.webpro.player.desktop.ui.components.RemoteImage
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat
import kotlinx.coroutines.flow.map

private data class Tile(val section: Section, val subtitle: String, val colors: List<Color>)

private val tiles = listOf(
    Tile(Section.LIVE, S.TILE_LIVE, listOf(Color(0xFFFF4D67), Color(0xFF8B2BE2))),
    Tile(Section.MOVIES, S.TILE_MOVIES, listOf(Color(0xFF4F8CFF), Color(0xFF2338A8))),
    Tile(Section.SERIES, S.TILE_SERIES, listOf(Color(0xFF8B5CF6), Color(0xFF4C1D95))),
    Tile(Section.FAVORITES, S.TILE_FAVORITES, listOf(Color(0xFFFFB020), Color(0xFFB45309))),
    Tile(Section.SEARCH, S.TILE_SEARCH, listOf(Color(0xFF22D3EE), Color(0xFF0E7490))),
    Tile(Section.SETTINGS, S.TILE_SETTINGS, listOf(Color(0xFF64748B), Color(0xFF1E293B)))
)

@Composable
fun HomeScreen(onOpenSection: (Section) -> Unit) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val session by container.sessionRepository.session.collectAsState()
    val continueFlow = remember {
        container.historyRepository.resumePoints.map { m -> m.values.filter { it.positionMs > 0 }.sortedByDescending { it.updatedAt }.take(15) }
    }
    val continueWatching by continueFlow.collectAsState(emptyList())

    LazyVerticalGrid(
        columns = GridCells.Adaptive(240.dp),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Dimens.ScreenPadding),
        horizontalArrangement = Arrangement.spacedBy(18.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column {
                val user = session?.credentials?.username.orEmpty()
                Text(if (user.isNotBlank()) S.greeting(user) else S.HOME, style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(4.dp))
                Text(S.HOME_SUBTITLE, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary)
                session?.account?.let { account ->
                    Spacer(Modifier.height(12.dp))
                    Row(
                        Modifier.clip(MaterialTheme.shapes.extraLarge).background(WebProColors.Surface).padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (account.isActive) WebProColors.Success else WebProColors.Error))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            listOfNotNull(account.status, account.expirationEpochSeconds?.let { TimeFormat.date(it) }).joinToString(" · ").ifBlank { "—" },
                            style = MaterialTheme.typography.labelLarge,
                            color = WebProColors.TextSecondary
                        )
                    }
                }
            }
        }
        items(tiles, key = { it.section.name }) { tile ->
            FocusableCard(onClick = { onOpenSection(tile.section) }, shape = MaterialTheme.shapes.large, focusedScale = 1.04f,
                modifier = Modifier.fillMaxWidth().height(140.dp)) { focused ->
                Box(
                    Modifier.fillMaxSize()
                        .background(Brush.linearGradient(tile.colors.map { if (focused) it else it.copy(alpha = 0.82f) }))
                        .padding(18.dp)
                ) {
                    Icon(tile.section.iconVector(), null, tint = Color.White, modifier = Modifier.size(40.dp).align(Alignment.TopStart))
                    Column(Modifier.align(Alignment.BottomStart)) {
                        Text(tile.section.label(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                        Text(tile.subtitle, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f))
                    }
                }
            }
        }
        if (continueWatching.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    Spacer(Modifier.height(8.dp))
                    Text(S.CONTINUE_WATCHING, style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(12.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(16.dp), contentPadding = PaddingValues(4.dp)) {
                        items(continueWatching, key = { it.key }) { point ->
                            ContinueCard(point) {
                                when (point.type) {
                                    ContentType.MOVIE -> navigator.play(PlayerTarget(ContentType.MOVIE, point.id, point.title.orEmpty()))
                                    ContentType.EPISODE -> point.seriesId?.let {
                                        navigator.play(PlayerTarget(ContentType.EPISODE, point.id, point.title.orEmpty(), seriesId = it))
                                    }
                                    else -> Unit
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ContinueCard(point: ResumePoint, onClick: () -> Unit) {
    FocusableCard(onClick = onClick, modifier = Modifier.width(300.dp)) {
        Column {
            Box {
                RemoteImage(point.imageUrl, point.title, Modifier.fillMaxWidth().aspectRatio(16f / 9f),
                    fallbackIcon = if (point.type == ContentType.MOVIE) Icons.Rounded.Movie else Icons.Rounded.PlayCircle)
                LinearProgressIndicator(progress = { point.progress }, modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                    color = WebProColors.Primary, trackColor = WebProColors.Scrim)
            }
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(point.title ?: "—", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val detail = if (point.type == ContentType.EPISODE && point.season != null && point.episodeNumber != null) {
                    S.episodeLabel(point.season, point.episodeNumber)
                } else S.MOVIE_LABEL
                Text("$detail · ${TimeFormat.playback(point.positionMs)}", style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
            }
        }
    }
}
