package com.webpro.player.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.SearchResults
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.common.message
import com.webpro.player.ui.components.ChannelRow
import com.webpro.player.ui.components.EmptyView
import com.webpro.player.ui.components.ErrorView
import com.webpro.player.ui.components.LoadingView
import com.webpro.player.ui.components.PosterCard
import com.webpro.player.ui.components.ScreenHeader
import com.webpro.player.ui.components.SearchField

@Composable
fun SearchScreen(
    navigator: ContentNavigator,
    viewModel: SearchViewModel = viewModel(factory = SearchViewModel.Factory)
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val favorites by viewModel.favoriteKeys.collectAsStateWithLifecycle()
    val padding = LocalDeviceProfile.current.screenPadding

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            title = stringResource(R.string.section_search),
            subtitle = stringResource(R.string.search_subtitle),
            modifier = Modifier.padding(start = padding, end = padding, top = padding / 2)
        )
        Spacer(Modifier.height(10.dp))
        SearchField(
            value = query,
            onValueChange = viewModel::onQueryChange,
            placeholder = stringResource(R.string.search_hint),
            modifier = Modifier.padding(horizontal = padding)
        )
        Spacer(Modifier.height(12.dp))
        when (val current = state) {
            null -> EmptyView(
                title = stringResource(R.string.search_idle_title),
                message = stringResource(R.string.search_idle_message),
                icon = Icons.Rounded.Search
            )
            UiState.Loading -> LoadingView(message = stringResource(R.string.search_loading))
            UiState.Empty -> EmptyView(
                title = stringResource(R.string.search_empty_title),
                message = stringResource(R.string.search_empty_message, query.trim())
            )
            is UiState.Error -> ErrorView(message = current.error.message(), onRetry = null)
            is UiState.Success -> SearchResultsList(current.data, favorites, navigator, viewModel::toggleFavorite)
        }
    }
}

@Composable
private fun SearchResultsList(
    results: SearchResults,
    favorites: Set<String>,
    navigator: ContentNavigator,
    onToggleChannelFavorite: (LiveChannel) -> Unit
) {
    val device = LocalDeviceProfile.current
    val padding = device.screenPadding
    val posterWidth = device.posterMinWidth + 10.dp
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (results.channels.isNotEmpty()) {
            item(key = "channels_header") {
                SectionTitle(stringResource(R.string.search_section_channels, results.channels.size), padding)
            }
            items(results.channels, key = { "c_${it.streamId}" }) { channel ->
                ChannelRow(
                    channel = channel,
                    isFavorite = FavoriteItem.keyOf(ContentType.LIVE, channel.streamId) in favorites,
                    onClick = { navigator.playChannel(channel.streamId, channel.name, Category.ALL_ID) },
                    onToggleFavorite = { onToggleChannelFavorite(channel) },
                    modifier = Modifier.padding(horizontal = padding)
                )
            }
        }
        if (results.movies.isNotEmpty()) {
            item(key = "movies") {
                Column {
                    SectionTitle(stringResource(R.string.search_section_movies, results.movies.size), padding)
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = padding, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        items(results.movies, key = { it.streamId }) { movie ->
                            PosterCard(
                                title = movie.name,
                                imageUrl = movie.posterUrl,
                                subtitle = movie.year,
                                rating = movie.rating,
                                isFavorite = FavoriteItem.keyOf(ContentType.MOVIE, movie.streamId) in favorites,
                                onClick = { navigator.openMovie(movie.streamId) },
                                modifier = Modifier.width(posterWidth)
                            )
                        }
                    }
                }
            }
        }
        if (results.series.isNotEmpty()) {
            item(key = "series") {
                Column {
                    SectionTitle(stringResource(R.string.search_section_series, results.series.size), padding)
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = padding, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        items(results.series, key = { it.seriesId }) { series ->
                            PosterCard(
                                title = series.name,
                                imageUrl = series.coverUrl,
                                subtitle = series.year,
                                rating = series.rating,
                                isFavorite = FavoriteItem.keyOf(ContentType.SERIES, series.seriesId) in favorites,
                                fallbackIcon = Icons.Rounded.VideoLibrary,
                                onClick = { navigator.openSeries(series.seriesId) },
                                modifier = Modifier.width(posterWidth)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String, padding: Dp) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(start = padding, end = padding, top = 16.dp, bottom = 4.dp)
    )
}
