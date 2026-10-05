package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.components.DetailBackdrop
import com.webpro.player.desktop.ui.components.EmptyView
import com.webpro.player.desktop.ui.components.ErrorView
import com.webpro.player.desktop.ui.components.LabeledText
import com.webpro.player.desktop.ui.components.LoadingView
import com.webpro.player.desktop.ui.components.MetadataRow
import com.webpro.player.desktop.ui.components.RemoteImage
import com.webpro.player.desktop.ui.rememberScreenModel
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.components.FocusableCard
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

@Composable
private fun BackButton() {
    val navigator = LocalNavigator.current
    IconButton(onClick = { navigator.back() }, modifier = Modifier.padding(12.dp)) {
        Icon(Icons.AutoMirrored.Rounded.ArrowBack, S.BACK)
    }
}

@Composable
private fun FavoriteButton(isFavorite: Boolean, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick) {
        Icon(if (isFavorite) Icons.Rounded.Star else Icons.Rounded.StarBorder, null,
            tint = if (isFavorite) WebProColors.Favorite else WebProColors.TextPrimary)
        Spacer(Modifier.width(6.dp))
        Text(if (isFavorite) S.REMOVE_FAVORITE else S.ADD_FAVORITE)
    }
}

@Composable
fun MovieDetailScreen(movieId: Long) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val model = rememberScreenModel(movieId) { MovieDetailModel(container, movieId) }
    val state by model.state.collectAsState()
    val isFavorite by model.isFavorite.collectAsState()
    val resume by model.resume.collectAsState()

    Box(Modifier.fillMaxSize()) {
        when (val s = state) {
            UiState.Loading -> LoadingView()
            UiState.Empty -> EmptyView(S.EMPTY_TITLE, S.CATALOG_EMPTY)
            is UiState.Error -> ErrorView(S.error(s.error), model::load)
            is UiState.Success -> {
                val details = s.data
                val movie = details.movie
                val resumeAt = resume?.takeIf { it.positionMs > 0 }
                val scroll = rememberScrollState()
                DetailBackdrop(details.backdropUrl ?: movie.posterUrl, 460.dp)
                Row(Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 48.dp, vertical = 72.dp)) {
                    RemoteImage(movie.posterUrl, movie.name, Modifier.width(260.dp).aspectRatio(2f / 3f).clip(MaterialTheme.shapes.large),
                        fallbackIcon = Icons.Rounded.Movie, maxSize = 600)
                    Spacer(Modifier.width(36.dp))
                    Column(Modifier.weight(1f)) {
                        Text(movie.name, style = MaterialTheme.typography.headlineMedium)
                        Spacer(Modifier.height(8.dp))
                        MetadataRow(details.year, details.genre, details.durationLabel, movie.rating)
                        Spacer(Modifier.height(22.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Button(onClick = { navigator.play(PlayerTarget(ContentType.MOVIE, movie.streamId, movie.name, movie.containerExtension)) }) {
                                Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp))
                                Text(if (resumeAt != null) S.continueAt(TimeFormat.playback(resumeAt.positionMs)) else S.PLAY)
                            }
                            if (resumeAt != null) {
                                OutlinedButton(onClick = {
                                    navigator.play(PlayerTarget(ContentType.MOVIE, movie.streamId, movie.name, movie.containerExtension, resume = false))
                                }) { Icon(Icons.Rounded.Replay, null); Spacer(Modifier.width(6.dp)); Text(S.FROM_START) }
                            }
                            FavoriteButton(isFavorite, model::toggleFavorite)
                        }
                        if (resumeAt != null && resumeAt.durationMs > 0) {
                            Spacer(Modifier.height(14.dp))
                            LinearProgressIndicator(progress = { resumeAt.progress }, modifier = Modifier.widthIn(max = 380.dp).fillMaxWidth(),
                                color = WebProColors.Primary, trackColor = WebProColors.SurfaceHighest)
                        }
                        Spacer(Modifier.height(24.dp))
                        Text(details.plot ?: S.NO_PLOT, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary,
                            modifier = Modifier.widthIn(max = 820.dp))
                        Spacer(Modifier.height(18.dp))
                        LabeledText(S.DIRECTOR, details.director)
                        Spacer(Modifier.height(12.dp))
                        LabeledText(S.CAST, details.cast, Modifier.widthIn(max = 820.dp))
                    }
                }
                VerticalScrollbar(rememberScrollbarAdapter(scroll), Modifier.align(Alignment.CenterEnd).fillMaxHeight())
            }
        }
        BackButton()
    }
}

@Composable
fun SeriesDetailScreen(seriesId: Long) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val model = rememberScreenModel(seriesId) { SeriesDetailModel(container, seriesId) }
    val state by model.state.collectAsState()
    val season by model.selectedSeason.collectAsState()
    val isFavorite by model.isFavorite.collectAsState()
    val lastWatched by model.lastWatched.collectAsState()
    val resumePoints by model.resumePoints.collectAsState()

    fun play(episode: Episode) = navigator.play(
        PlayerTarget(ContentType.EPISODE, episode.id, episode.title, episode.containerExtension, seriesId = seriesId)
    )

    Box(Modifier.fillMaxSize()) {
        when (val s = state) {
            UiState.Loading -> LoadingView()
            UiState.Empty -> EmptyView(S.EMPTY_TITLE, S.NO_EPISODES)
            is UiState.Error -> ErrorView(S.error(s.error), { model.load() })
            is UiState.Success -> {
                val details = s.data
                val series = details.series
                val continueEpisode = model.continueEpisode(details)
                val episodes = season?.let { details.episodesBySeason[it] }.orEmpty()
                val listState = rememberLazyListState()
                DetailBackdrop(details.backdropUrl ?: series.coverUrl, 440.dp)
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 72.dp, bottom = 40.dp)) {
                    item {
                        Row(Modifier.padding(horizontal = 48.dp)) {
                            RemoteImage(series.coverUrl, series.name, Modifier.width(230.dp).aspectRatio(2f / 3f).clip(MaterialTheme.shapes.large),
                                fallbackIcon = Icons.Rounded.VideoLibrary, maxSize = 600)
                            Spacer(Modifier.width(32.dp))
                            Column(Modifier.weight(1f)) {
                                Text(series.name, style = MaterialTheme.typography.headlineMedium)
                                Spacer(Modifier.height(8.dp))
                                MetadataRow(series.year, series.genre,
                                    if (details.seasons.isNotEmpty()) S.seasonsCount(details.seasons.size) else null, series.rating)
                                Spacer(Modifier.height(18.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    if (continueEpisode != null) {
                                        val isContinue = lastWatched?.id == continueEpisode.id
                                        Button(onClick = { play(continueEpisode) }) {
                                            Icon(Icons.Rounded.PlayArrow, null); Spacer(Modifier.width(6.dp))
                                            Text(
                                                if (isContinue) S.continueEpisode(continueEpisode.season, continueEpisode.episodeNumber)
                                                else S.playEpisode(continueEpisode.season, continueEpisode.episodeNumber)
                                            )
                                        }
                                    }
                                    FavoriteButton(isFavorite, model::toggleFavorite)
                                }
                                Spacer(Modifier.height(18.dp))
                                Text(series.plot ?: S.NO_PLOT, style = MaterialTheme.typography.bodyLarge, color = WebProColors.TextSecondary,
                                    maxLines = 6, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 820.dp))
                                Spacer(Modifier.height(12.dp))
                                LabeledText(S.CAST, details.cast, Modifier.widthIn(max = 820.dp))
                            }
                        }
                    }
                    if (details.seasons.isEmpty()) {
                        item { Text(S.NO_EPISODES, color = WebProColors.TextSecondary, modifier = Modifier.padding(48.dp)) }
                    } else {
                        item {
                            Column {
                                Spacer(Modifier.height(28.dp))
                                Text(S.SEASONS, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 48.dp))
                                Spacer(Modifier.height(10.dp))
                                LazyRow(contentPadding = PaddingValues(horizontal = 48.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(details.seasons, key = { it.number }) { s2 ->
                                        FilterChip(
                                            selected = s2.number == season,
                                            onClick = { model.selectSeason(s2.number) },
                                            label = { Text("${s2.name} (${s2.episodeCount})") },
                                            colors = FilterChipDefaults.filterChipColors(
                                                selectedContainerColor = WebProColors.Primary,
                                                selectedLabelColor = WebProColors.TextPrimary
                                            )
                                        )
                                    }
                                }
                                Spacer(Modifier.height(14.dp))
                            }
                        }
                        items(episodes, key = { it.id }) { episode ->
                            EpisodeRow(
                                episode,
                                resumePoints[ResumePoint.keyOf(ContentType.EPISODE, episode.id)]?.progress,
                                { play(episode) },
                                Modifier.padding(horizontal = 48.dp, vertical = 5.dp)
                            )
                        }
                    }
                }
                VerticalScrollbar(rememberScrollbarAdapter(listState), Modifier.align(Alignment.CenterEnd).fillMaxHeight())
            }
        }
        BackButton()
    }
}

@Composable
private fun EpisodeRow(episode: Episode, progress: Float?, onClick: () -> Unit, modifier: Modifier) {
    FocusableCard(onClick = onClick, focusedScale = 1.01f, modifier = modifier.fillMaxWidth()) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                RemoteImage(episode.imageUrl, episode.title, Modifier.width(200.dp).aspectRatio(16f / 9f).clip(MaterialTheme.shapes.small),
                    fallbackIcon = Icons.Rounded.PlayArrow)
                if (progress != null && progress > 0f) {
                    LinearProgressIndicator(progress = { progress }, modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(4.dp),
                        color = WebProColors.Primary, trackColor = WebProColors.Scrim)
                }
            }
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(S.episodeTitle(episode.episodeNumber, episode.title), style = MaterialTheme.typography.titleMedium,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                episode.durationLabel?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = WebProColors.TextMuted) }
                if (!episode.plot.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(episode.plot, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

