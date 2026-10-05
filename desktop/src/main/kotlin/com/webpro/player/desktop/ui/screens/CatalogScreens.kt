package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.VerticalScrollbar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.components.CategorySidebar
import com.webpro.player.desktop.ui.components.ChannelRow
import com.webpro.player.desktop.ui.components.Dimens
import com.webpro.player.desktop.ui.components.EmptyView
import com.webpro.player.desktop.ui.components.ErrorView
import com.webpro.player.desktop.ui.components.PosterCard
import com.webpro.player.desktop.ui.components.SearchField
import com.webpro.player.desktop.ui.components.SkeletonGrid
import com.webpro.player.desktop.ui.components.SkeletonList
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.Series
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.components.ScreenHeader

@Composable
private fun <T> CatalogLayout(
    title: String,
    searchHint: String,
    model: CatalogModel<T>,
    emptyTitle: String,
    loading: @Composable () -> Unit,
    content: @Composable (List<T>, Set<String>) -> Unit
) {
    val state by model.state.collectAsState()
    val categories by model.categories.collectAsState()
    val selected by model.selectedCategoryId.collectAsState()
    val query by model.query.collectAsState()
    val favorites by model.favoriteKeys.collectAsState()
    val count = (state as? UiState.Success)?.data?.size

    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        ScreenHeader(
            title = title,
            subtitle = count?.let(S::items),
            modifier = Modifier.padding(horizontal = Dimens.ScreenPadding),
            actions = {
                IconButton(onClick = { model.load(true) }) { Icon(Icons.Rounded.Refresh, S.REFRESH) }
            }
        )
        Spacer(Modifier.height(12.dp))
        SearchField(query, model::onQueryChange, searchHint, Modifier.padding(horizontal = Dimens.ScreenPadding))
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxSize()) {
            CategorySidebar(
                categories, selected, model::selectCategory,
                Modifier.width(Dimens.SidebarWidth).fillMaxHeight().padding(start = Dimens.ScreenPadding - 4.dp, bottom = 12.dp)
            )
            Spacer(Modifier.width(14.dp))
            Box(Modifier.weight(1f).fillMaxHeight().padding(end = Dimens.ScreenPadding / 2)) {
                when (val s = state) {
                    UiState.Loading -> loading()
                    UiState.Empty -> EmptyView(emptyTitle, S.CATALOG_EMPTY)
                    is UiState.Error -> ErrorView(S.error(s.error), onRetry = { model.load(true) })
                    is UiState.Success -> content(s.data, favorites)
                }
            }
        }
    }
}

@Composable
fun LiveScreen(model: CatalogModel<LiveChannel>) {
    val navigator = LocalNavigator.current
    val selected by model.selectedCategoryId.collectAsState()
    CatalogLayout(S.LIVE, S.SEARCH_CHANNEL, model, S.NO_CHANNELS, { SkeletonList() }) { channels, favorites ->
        val listState = rememberLazyListState()
        LaunchedEffect(selected) { listState.scrollToItem(0) }
        Box(Modifier.fillMaxSize()) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().padding(end = 12.dp),
                contentPadding = PaddingValues(bottom = 24.dp, top = 4.dp, start = 4.dp, end = 4.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                items(channels, key = { it.streamId }) { channel ->
                    ChannelRow(
                        channel = channel,
                        isFavorite = model.isFavorite(channel, favorites),
                        onClick = { navigator.play(PlayerTarget(ContentType.LIVE, channel.streamId, channel.name, categoryId = selected)) },
                        onToggleFavorite = { model.toggleFavorite(channel) }
                    )
                }
            }
            VerticalScrollbar(rememberScrollbarAdapter(listState), Modifier.align(Alignment.CenterEnd).fillMaxHeight())
        }
    }
}

@Composable
fun MoviesScreen(model: CatalogModel<Movie>) {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val selected by model.selectedCategoryId.collectAsState()
    val progressFlow = remember { container.historyRepository.resumePoints }
    val resume by progressFlow.collectAsState(emptyMap())
    CatalogLayout(S.MOVIES, S.SEARCH_MOVIE, model, S.NO_MOVIES, { SkeletonGrid(Dimens.PosterMinWidth) }) { movies, favorites ->
        val gridState = rememberLazyGridState()
        LaunchedEffect(selected) { gridState.scrollToItem(0) }
        Box(Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(Dimens.PosterMinWidth),
                modifier = Modifier.fillMaxSize().padding(end = 12.dp),
                contentPadding = PaddingValues(6.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(movies, key = { it.streamId }) { movie ->
                    PosterCard(
                        title = movie.name,
                        imageUrl = movie.posterUrl,
                        subtitle = movie.year,
                        rating = movie.rating,
                        isFavorite = model.isFavorite(movie, favorites),
                        progress = resume[ResumePoint.keyOf(ContentType.MOVIE, movie.streamId)]?.progress,
                        onClick = { navigator.openMovie(movie.streamId) },
                        onToggleFavorite = { model.toggleFavorite(movie) }
                    )
                }
            }
            VerticalScrollbar(rememberScrollbarAdapter(gridState), Modifier.align(Alignment.CenterEnd).fillMaxHeight())
        }
    }
}

@Composable
fun SeriesScreen(model: CatalogModel<Series>) {
    val navigator = LocalNavigator.current
    val selected by model.selectedCategoryId.collectAsState()
    CatalogLayout(S.SERIES, S.SEARCH_SERIES, model, S.NO_SERIES, { SkeletonGrid(Dimens.PosterMinWidth) }) { list, favorites ->
        val gridState = rememberLazyGridState()
        LaunchedEffect(selected) { gridState.scrollToItem(0) }
        Box(Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(Dimens.PosterMinWidth),
                modifier = Modifier.fillMaxSize().padding(end = 12.dp),
                contentPadding = PaddingValues(6.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(list, key = { it.seriesId }) { series ->
                    PosterCard(
                        title = series.name,
                        imageUrl = series.coverUrl,
                        subtitle = listOfNotNull(series.year, series.genre?.substringBefore(',')).joinToString(" · "),
                        rating = series.rating,
                        isFavorite = model.isFavorite(series, favorites),
                        fallbackIcon = Icons.Rounded.VideoLibrary,
                        onClick = { navigator.openSeries(series.seriesId) },
                        onToggleFavorite = { model.toggleFavorite(series) }
                    )
                }
            }
            VerticalScrollbar(rememberScrollbarAdapter(gridState), Modifier.align(Alignment.CenterEnd).fillMaxHeight())
        }
    }
}

