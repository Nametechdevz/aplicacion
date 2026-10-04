package com.webpro.player.ui.series

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.message
import com.webpro.player.ui.components.DetailBackdrop
import com.webpro.player.ui.components.EmptyView
import com.webpro.player.ui.components.ErrorView
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.components.LabeledText
import com.webpro.player.ui.components.LoadingView
import com.webpro.player.ui.components.MetadataRow
import com.webpro.player.ui.components.RemoteImage
import com.webpro.player.ui.theme.WebProColors

@Composable
fun SeriesDetailScreen(
    navigator: ContentNavigator,
    viewModel: SeriesDetailViewModel = viewModel(factory = SeriesDetailViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val selectedSeason by viewModel.selectedSeason.collectAsStateWithLifecycle()
    val isFavorite by viewModel.isFavorite.collectAsStateWithLifecycle()
    val lastWatched by viewModel.lastWatched.collectAsStateWithLifecycle()
    val resumePoints by viewModel.resumePoints.collectAsStateWithLifecycle()

    Box(Modifier.fillMaxSize()) {
        when (val current = state) {
            UiState.Loading -> LoadingView()
            UiState.Empty -> EmptyView(
                title = stringResource(R.string.state_empty_title),
                message = stringResource(R.string.series_no_episodes)
            )
            is UiState.Error -> ErrorView(message = current.error.message(), onRetry = { viewModel.load() })
            is UiState.Success -> SeriesDetailContent(
                details = current.data,
                selectedSeason = selectedSeason,
                isFavorite = isFavorite,
                lastWatched = lastWatched,
                resumePoints = resumePoints,
                continueEpisode = viewModel.continueEpisode(current.data),
                onSelectSeason = viewModel::selectSeason,
                onToggleFavorite = viewModel::toggleFavorite,
                onPlayEpisode = { episode, resume ->
                    navigator.playEpisode(episode.id, episode.title, episode.containerExtension, viewModel.seriesId, resume)
                }
            )
        }
        IconButton(
            onClick = { navigator.back() },
            modifier = Modifier
                .statusBarsPadding()
                .padding(8.dp)
        ) {
            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = stringResource(R.string.action_back))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SeriesDetailContent(
    details: SeriesDetails,
    selectedSeason: Int?,
    isFavorite: Boolean,
    lastWatched: ResumePoint?,
    resumePoints: Map<String, ResumePoint>,
    continueEpisode: Episode?,
    onSelectSeason: (Int) -> Unit,
    onToggleFavorite: () -> Unit,
    onPlayEpisode: (Episode, Boolean) -> Unit
) {
    val device = LocalDeviceProfile.current
    val padding = device.screenPadding
    val playFocus = remember { FocusRequester() }
    val series = details.series
    val episodes = selectedSeason?.let { details.episodesBySeason[it] }.orEmpty()

    LaunchedEffect(Unit) {
        if (device.isTv) runCatching { playFocus.requestFocus() }
    }

    Box(Modifier.fillMaxSize()) {
        DetailBackdrop(imageUrl = details.backdropUrl ?: series.coverUrl, height = 400.dp)
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
            contentPadding = PaddingValues(top = 64.dp, bottom = 32.dp)
        ) {
            item(key = "header") {
                Row(Modifier.padding(horizontal = padding)) {
                    if (!device.isCompact) {
                        RemoteImage(
                            url = series.coverUrl,
                            contentDescription = series.name,
                            fallbackIcon = Icons.Rounded.VideoLibrary,
                            modifier = Modifier
                                .width(if (device.isTv) 220.dp else 190.dp)
                                .aspectRatio(2f / 3f)
                                .clip(MaterialTheme.shapes.large)
                        )
                        Spacer(Modifier.width(28.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(series.name, style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.height(8.dp))
                        MetadataRow(
                            year = series.year,
                            genre = series.genre,
                            duration = if (details.seasons.isNotEmpty()) {
                                stringResource(R.string.series_seasons_count, details.seasons.size)
                            } else null,
                            rating = series.rating
                        )
                        Spacer(Modifier.height(18.dp))
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            if (continueEpisode != null) {
                                val isContinue = lastWatched != null && lastWatched.id == continueEpisode.id
                                Button(
                                    onClick = { onPlayEpisode(continueEpisode, true) },
                                    modifier = Modifier.focusRequester(playFocus)
                                ) {
                                    Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                                    Spacer(Modifier.width(6.dp))
                                    Text(
                                        stringResource(
                                            if (isContinue) R.string.series_continue else R.string.series_play,
                                            continueEpisode.season,
                                            continueEpisode.episodeNumber
                                        )
                                    )
                                }
                            }
                            OutlinedButton(onClick = onToggleFavorite) {
                                Icon(
                                    if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                    contentDescription = null,
                                    tint = if (isFavorite) WebProColors.Favorite else WebProColors.TextPrimary
                                )
                                Spacer(Modifier.width(6.dp))
                                Text(
                                    stringResource(if (isFavorite) R.string.action_remove_favorite else R.string.action_add_favorite)
                                )
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        Text(
                            series.plot ?: stringResource(R.string.detail_no_plot),
                            style = MaterialTheme.typography.bodyLarge,
                            color = WebProColors.TextSecondary,
                            maxLines = 6,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.widthIn(max = 760.dp)
                        )
                        Spacer(Modifier.height(12.dp))
                        LabeledText(stringResource(R.string.detail_cast), details.cast, Modifier.widthIn(max = 760.dp))
                    }
                }
            }

            if (details.seasons.isEmpty()) {
                item(key = "no_episodes") {
                    Text(
                        stringResource(R.string.series_no_episodes),
                        style = MaterialTheme.typography.bodyLarge,
                        color = WebProColors.TextSecondary,
                        modifier = Modifier.padding(horizontal = padding, vertical = 24.dp)
                    )
                }
            } else {
                item(key = "seasons") {
                    Column {
                        Spacer(Modifier.height(24.dp))
                        Text(
                            stringResource(R.string.series_seasons),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.padding(horizontal = padding)
                        )
                        Spacer(Modifier.height(10.dp))
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = padding),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(details.seasons, key = { it.number }) { season ->
                                FilterChip(
                                    selected = season.number == selectedSeason,
                                    onClick = { onSelectSeason(season.number) },
                                    label = { Text("${season.name} (${season.episodeCount})") },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = WebProColors.Primary,
                                        selectedLabelColor = WebProColors.TextPrimary,
                                        containerColor = WebProColors.Surface
                                    )
                                )
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                    }
                }
                items(episodes, key = { "episode_${it.id}" }) { episode ->
                    EpisodeRow(
                        episode = episode,
                        progress = resumePoints[ResumePoint.keyOf(ContentType.EPISODE, episode.id)]?.progress,
                        onClick = { onPlayEpisode(episode, true) },
                        modifier = Modifier.padding(horizontal = padding, vertical = 6.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: Episode,
    progress: Float?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val device = LocalDeviceProfile.current
    FocusableCard(
        onClick = onClick,
        focusedScale = 1.02f,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                RemoteImage(
                    url = episode.imageUrl,
                    contentDescription = episode.title,
                    fallbackIcon = Icons.Rounded.PlayArrow,
                    modifier = Modifier
                        .width(if (device.isCompact) 128.dp else 176.dp)
                        .aspectRatio(16f / 9f)
                        .clip(MaterialTheme.shapes.small)
                )
                if (progress != null && progress > 0f) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(4.dp),
                        color = WebProColors.Primary,
                        trackColor = WebProColors.Scrim
                    )
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.series_episode_title, episode.episodeNumber, episode.title),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (episode.durationLabel != null) {
                    Text(episode.durationLabel, style = MaterialTheme.typography.labelMedium, color = WebProColors.TextMuted)
                }
                if (!episode.plot.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        episode.plot,
                        style = MaterialTheme.typography.bodySmall,
                        color = WebProColors.TextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
