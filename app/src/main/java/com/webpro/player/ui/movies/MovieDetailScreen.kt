package com.webpro.player.ui.movies

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.Button
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.message
import com.webpro.player.ui.components.DetailBackdrop
import com.webpro.player.ui.components.EmptyView
import com.webpro.player.ui.components.ErrorView
import com.webpro.player.ui.components.LabeledText
import com.webpro.player.ui.components.LoadingView
import com.webpro.player.ui.components.MetadataRow
import com.webpro.player.ui.components.RemoteImage
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

@Composable
fun MovieDetailScreen(
    navigator: ContentNavigator,
    viewModel: MovieDetailViewModel = viewModel(factory = MovieDetailViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isFavorite by viewModel.isFavorite.collectAsStateWithLifecycle()
    val resume by viewModel.resumePoint.collectAsStateWithLifecycle()

    Box(Modifier.fillMaxSize()) {
        when (val current = state) {
            UiState.Loading -> LoadingView()
            UiState.Empty -> EmptyView(
                title = stringResource(R.string.state_empty_title),
                message = stringResource(R.string.catalog_empty_message)
            )
            is UiState.Error -> ErrorView(message = current.error.message(), onRetry = viewModel::load)
            is UiState.Success -> MovieDetailContent(
                details = current.data,
                isFavorite = isFavorite,
                resume = resume,
                onPlay = { fromStart ->
                    val movie = current.data.movie
                    navigator.playMovie(movie.streamId, movie.name, movie.containerExtension, resume = !fromStart)
                },
                onToggleFavorite = viewModel::toggleFavorite
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
private fun MovieDetailContent(
    details: MovieDetails,
    isFavorite: Boolean,
    resume: ResumePoint?,
    onPlay: (fromStart: Boolean) -> Unit,
    onToggleFavorite: () -> Unit
) {
    val device = LocalDeviceProfile.current
    val playFocus = remember { FocusRequester() }
    val movie = details.movie
    val resumeAt = resume?.takeIf { it.positionMs > 0 }
    val hasResume = resumeAt != null

    LaunchedEffect(Unit) {
        if (device.isTv) runCatching { playFocus.requestFocus() }
    }

    Box(Modifier.fillMaxSize()) {
        DetailBackdrop(imageUrl = details.backdropUrl ?: movie.posterUrl, height = 420.dp)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .padding(horizontal = device.screenPadding)
                .padding(top = 64.dp, bottom = 32.dp)
        ) {
            val info: @Composable ColumnScope.() -> Unit = {
                Text(movie.name, style = MaterialTheme.typography.headlineMedium)
                Spacer(Modifier.height(8.dp))
                MetadataRow(
                    year = details.year,
                    genre = details.genre,
                    duration = details.durationLabel,
                    rating = movie.rating
                )
                Spacer(Modifier.height(20.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(onClick = { onPlay(false) }, modifier = Modifier.focusRequester(playFocus)) {
                        Icon(Icons.Rounded.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (resumeAt != null) {
                                stringResource(R.string.detail_continue_at, TimeFormat.playback(resumeAt.positionMs))
                            } else {
                                stringResource(R.string.detail_play)
                            }
                        )
                    }
                    if (hasResume) {
                        OutlinedButton(onClick = { onPlay(true) }) {
                            Icon(Icons.Rounded.Replay, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.detail_from_start))
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
                if (resumeAt != null && resumeAt.durationMs > 0) {
                    Spacer(Modifier.height(14.dp))
                    LinearProgressIndicator(
                        progress = { resumeAt.progress },
                        modifier = Modifier
                            .widthIn(max = 360.dp)
                            .fillMaxWidth()
                            .clip(MaterialTheme.shapes.extraSmall),
                        color = WebProColors.Primary,
                        trackColor = WebProColors.SurfaceHighest
                    )
                }
                Spacer(Modifier.height(22.dp))
                Text(
                    details.plot ?: stringResource(R.string.detail_no_plot),
                    style = MaterialTheme.typography.bodyLarge,
                    color = WebProColors.TextSecondary,
                    modifier = Modifier.widthIn(max = 760.dp)
                )
                Spacer(Modifier.height(18.dp))
                LabeledText(stringResource(R.string.detail_director), details.director)
                Spacer(Modifier.height(12.dp))
                LabeledText(stringResource(R.string.detail_cast), details.cast, Modifier.widthIn(max = 760.dp))
            }

            if (device.isCompact) {
                RemoteImage(
                    url = movie.posterUrl,
                    contentDescription = movie.name,
                    fallbackIcon = Icons.Rounded.Movie,
                    modifier = Modifier
                        .width(150.dp)
                        .aspectRatio(2f / 3f)
                        .clip(MaterialTheme.shapes.large)
                )
                Spacer(Modifier.height(20.dp))
                Column { info() }
            } else {
                Row {
                    RemoteImage(
                        url = movie.posterUrl,
                        contentDescription = movie.name,
                        fallbackIcon = Icons.Rounded.Movie,
                        modifier = Modifier
                            .width(if (device.isTv) 240.dp else 210.dp)
                            .aspectRatio(2f / 3f)
                            .clip(MaterialTheme.shapes.large)
                    )
                    Spacer(Modifier.width(32.dp))
                    Column(Modifier.weight(1f)) { info() }
                }
            }
        }
    }
}
