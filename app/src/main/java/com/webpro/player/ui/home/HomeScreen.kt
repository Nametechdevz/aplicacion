package com.webpro.player.ui.home

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
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PlayCircle
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.navigation.Section
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.components.RemoteImage
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

private data class HomeTile(
    val section: Section,
    val subtitleRes: Int,
    val colors: List<Color>
)

private val homeTiles = listOf(
    HomeTile(Section.LIVE, R.string.home_tile_live, listOf(Color(0xFFFF4D67), Color(0xFF8B2BE2))),
    HomeTile(Section.MOVIES, R.string.home_tile_movies, listOf(Color(0xFF4F8CFF), Color(0xFF2338A8))),
    HomeTile(Section.SERIES, R.string.home_tile_series, listOf(Color(0xFF8B5CF6), Color(0xFF4C1D95))),
    HomeTile(Section.FAVORITES, R.string.home_tile_favorites, listOf(Color(0xFFFFB020), Color(0xFFB45309))),
    HomeTile(Section.SEARCH, R.string.home_tile_search, listOf(Color(0xFF22D3EE), Color(0xFF0E7490))),
    HomeTile(Section.SETTINGS, R.string.home_tile_settings, listOf(Color(0xFF64748B), Color(0xFF1E293B)))
)

@Composable
fun HomeScreen(
    navigator: ContentNavigator,
    onOpenSection: (Section) -> Unit,
    viewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory)
) {
    val session by viewModel.session.collectAsStateWithLifecycle()
    val continueWatching by viewModel.continueWatching.collectAsStateWithLifecycle()
    val device = LocalDeviceProfile.current
    val padding = device.screenPadding
    val firstTileFocus = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        if (device.isTv) runCatching { firstTileFocus.requestFocus() }
    }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(device.tileMinWidth),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = padding, end = padding, top = padding / 2, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, key = "header") {
            HomeHeader(
                username = session?.credentials?.username.orEmpty(),
                account = session?.account,
                showShortcuts = device.isCompact,
                onFavorites = { onOpenSection(Section.FAVORITES) },
                onSettings = { onOpenSection(Section.SETTINGS) }
            )
        }
        itemsIndexed(homeTiles, key = { _, tile -> tile.section.name }) { index, tile ->
            HomeTileCard(
                tile = tile,
                onClick = { onOpenSection(tile.section) },
                modifier = if (index == 0) Modifier.focusRequester(firstTileFocus) else Modifier
            )
        }
        if (continueWatching.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "continue") {
                Column {
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.home_continue_watching), style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(12.dp))
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        contentPadding = PaddingValues(vertical = 6.dp, horizontal = 4.dp)
                    ) {
                        items(continueWatching, key = { it.key }) { point ->
                            ContinueCard(
                                point = point,
                                onClick = {
                                    when (point.type) {
                                        ContentType.MOVIE -> navigator.playMovie(point.id, point.title.orEmpty(), null)
                                        ContentType.EPISODE -> point.seriesId?.let { seriesId ->
                                            navigator.playEpisode(point.id, point.title.orEmpty(), null, seriesId)
                                        }
                                        else -> Unit
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHeader(
    username: String,
    account: AccountInfo?,
    showShortcuts: Boolean,
    onFavorites: () -> Unit,
    onSettings: () -> Unit
) {
    Column {
        if (showShortcuts) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppLogo(modifier = Modifier.weight(1f))
                IconButton(onClick = onFavorites) {
                    Icon(Icons.Rounded.Favorite, contentDescription = stringResource(R.string.section_favorites))
                }
                IconButton(onClick = onSettings) {
                    Icon(Icons.Rounded.Settings, contentDescription = stringResource(R.string.section_settings))
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        Text(
            text = if (username.isNotBlank()) stringResource(R.string.home_greeting, username)
            else stringResource(R.string.home_greeting_generic),
            style = MaterialTheme.typography.headlineMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.home_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = WebProColors.TextSecondary
        )
        if (account != null) {
            Spacer(Modifier.height(12.dp))
            AccountPill(account)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun AccountPill(account: AccountInfo) {
    val active = account.isActive
    val expiry = account.expirationEpochSeconds?.let { TimeFormat.date(it) }
    Row(
        modifier = Modifier
            .clip(MaterialTheme.shapes.extraLarge)
            .background(WebProColors.Surface)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (active) WebProColors.Success else WebProColors.Error)
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = buildString {
                append(account.status ?: "")
                if (expiry != null) {
                    if (isNotEmpty()) append(" · ")
                    append(expiry)
                }
            }.ifBlank { "—" },
            style = MaterialTheme.typography.labelLarge,
            color = WebProColors.TextSecondary
        )
    }
}

@Composable
private fun HomeTileCard(tile: HomeTile, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val device = LocalDeviceProfile.current
    FocusableCard(
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        focusedScale = 1.06f,
        modifier = modifier
            .fillMaxWidth()
            .height(if (device.isTv) 150.dp else if (device.isCompact) 118.dp else 138.dp)
    ) { focused ->
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.linearGradient(tile.colors.map { if (focused) it else it.copy(alpha = 0.82f) }))
                .padding(18.dp)
        ) {
            Icon(
                tile.section.icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier
                    .size(if (device.isCompact) 34.dp else 42.dp)
                    .align(Alignment.TopStart)
            )
            Column(Modifier.align(Alignment.BottomStart)) {
                Text(
                    stringResource(tile.section.labelRes),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    stringResource(tile.subtitleRes),
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.85f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun ContinueCard(point: ResumePoint, onClick: () -> Unit) {
    val device = LocalDeviceProfile.current
    FocusableCard(
        onClick = onClick,
        modifier = Modifier.width(if (device.isTv) 300.dp else 240.dp)
    ) {
        Column {
            Box {
                RemoteImage(
                    url = point.imageUrl,
                    contentDescription = point.title,
                    fallbackIcon = if (point.type == ContentType.MOVIE) Icons.Rounded.Movie else Icons.Rounded.PlayCircle,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                )
                LinearProgressIndicator(
                    progress = { point.progress },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth(),
                    color = WebProColors.Primary,
                    trackColor = WebProColors.Scrim
                )
            }
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(
                    point.title ?: stringResource(R.string.home_untitled),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val detail = if (point.type == ContentType.EPISODE && point.season != null && point.episodeNumber != null) {
                    stringResource(R.string.home_episode_label, point.season, point.episodeNumber)
                } else {
                    stringResource(R.string.home_movie_label)
                }
                Text(
                    "$detail · ${TimeFormat.playback(point.positionMs)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = WebProColors.TextSecondary
                )
            }
        }
    }
}
