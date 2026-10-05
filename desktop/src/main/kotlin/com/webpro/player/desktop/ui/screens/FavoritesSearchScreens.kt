package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.PlayerTarget
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.components.ChannelRow
import com.webpro.player.desktop.ui.components.Dimens
import com.webpro.player.desktop.ui.components.EmptyView
import com.webpro.player.desktop.ui.components.ErrorView
import com.webpro.player.desktop.ui.components.LoadingView
import com.webpro.player.desktop.ui.components.PosterCard
import com.webpro.player.desktop.ui.components.SearchField
import com.webpro.player.desktop.ui.rememberScreenModel
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.ui.common.UiState
import com.webpro.player.ui.components.ScreenHeader
import com.webpro.player.ui.theme.WebProColors
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@Composable
fun FavoritesScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val favorites by container.favoritesRepository.favorites.collectAsState(emptyList())
    var type by rememberSaveable { mutableStateOf(ContentType.LIVE) }
    val scope = rememberCoroutineScope()
    val items = favorites.filter { it.type == type }

    fun remove(item: FavoriteItem) = scope.launch { container.favoritesRepository.remove(item.type, item.id) }

    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        ScreenHeader(S.FAVORITES, subtitle = S.FAVORITES_SUBTITLE, modifier = Modifier.padding(horizontal = Dimens.ScreenPadding))
        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = Dimens.ScreenPadding), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(ContentType.LIVE to S.CHANNELS, ContentType.MOVIE to S.MOVIES, ContentType.SERIES to S.SERIES).forEach { (t, label) ->
                FilterChip(
                    selected = t == type,
                    onClick = { type = t },
                    label = { Text("$label (${favorites.count { it.type == t }})") },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = WebProColors.Primary, selectedLabelColor = WebProColors.TextPrimary)
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        if (items.isEmpty()) {
            EmptyView(S.FAVORITES_EMPTY_TITLE, S.FAVORITES_EMPTY, icon = Icons.Rounded.StarBorder)
            return@Column
        }
        LazyVerticalGrid(
            columns = if (type == ContentType.LIVE) GridCells.Adaptive(440.dp) else GridCells.Adaptive(Dimens.PosterMinWidth),
            modifier = Modifier.fillMaxSize().padding(horizontal = Dimens.ScreenPadding),
            contentPadding = PaddingValues(bottom = 24.dp, top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(if (type == ContentType.LIVE) 6.dp else 16.dp)
        ) {
            items(items, key = { it.key }) { item ->
                when (item.type) {
                    ContentType.LIVE -> ChannelRow(
                        LiveChannel(item.id, 0, item.name, item.imageUrl, item.categoryId, null, false),
                        isFavorite = true,
                        onClick = { navigator.play(PlayerTarget(ContentType.LIVE, item.id, item.name, categoryId = Category.FAVORITES_ID)) },
                        onToggleFavorite = { remove(item) }
                    )
                    ContentType.MOVIE -> PosterCard(item.name, item.imageUrl, { navigator.openMovie(item.id) },
                        isFavorite = true, onToggleFavorite = { remove(item) })
                    ContentType.SERIES -> PosterCard(item.name, item.imageUrl, { navigator.openSeries(item.id) },
                        isFavorite = true, onToggleFavorite = { remove(item) }, fallbackIcon = Icons.Rounded.VideoLibrary)
                    ContentType.EPISODE -> Unit
                }
            }
        }
    }
}

@Composable
fun SearchScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val model = rememberScreenModel { SearchModel(container) }
    val query by model.query.collectAsState()
    val state by model.state.collectAsState()
    val favorites by model.favoriteKeys.collectAsState()

    Column(Modifier.fillMaxSize().padding(top = 20.dp)) {
        ScreenHeader(S.SEARCH, subtitle = S.SEARCH_SUBTITLE, modifier = Modifier.padding(horizontal = Dimens.ScreenPadding))
        Spacer(Modifier.height(12.dp))
        SearchField(query, model::onQuery, S.SEARCH_HINT, Modifier.padding(horizontal = Dimens.ScreenPadding))
        Spacer(Modifier.height(12.dp))
        when (val s = state) {
            null -> EmptyView(S.SEARCH_IDLE_TITLE, S.SEARCH_IDLE, icon = Icons.Rounded.Search)
            UiState.Loading -> LoadingView(message = S.SEARCHING)
            UiState.Empty -> EmptyView(S.NO_RESULTS, S.noResultsFor(query.trim()))
            is UiState.Error -> ErrorView(S.error(s.error), null)
            is UiState.Success -> {
                val r = s.data
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (r.channels.isNotEmpty()) {
                        item { SectionTitle("${S.CHANNELS} (${r.channels.size})") }
                        items(r.channels, key = { "c${it.streamId}" }) { ch ->
                            ChannelRow(
                                ch,
                                FavoriteItem.keyOf(ContentType.LIVE, ch.streamId) in favorites,
                                { navigator.play(PlayerTarget(ContentType.LIVE, ch.streamId, ch.name, categoryId = Category.ALL_ID)) },
                                { model.toggleFavorite(ch) },
                                Modifier.padding(horizontal = Dimens.ScreenPadding)
                            )
                        }
                    }
                    if (r.movies.isNotEmpty()) {
                        item {
                            Column {
                                SectionTitle("${S.MOVIES} (${r.movies.size})")
                                LazyRow(contentPadding = PaddingValues(horizontal = Dimens.ScreenPadding, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    items(r.movies, key = { it.streamId }) { m ->
                                        PosterCard(m.name, m.posterUrl, { navigator.openMovie(m.streamId) }, Modifier.width(170.dp),
                                            subtitle = m.year, rating = m.rating, isFavorite = FavoriteItem.keyOf(ContentType.MOVIE, m.streamId) in favorites)
                                    }
                                }
                            }
                        }
                    }
                    if (r.series.isNotEmpty()) {
                        item {
                            Column {
                                SectionTitle("${S.SERIES} (${r.series.size})")
                                LazyRow(contentPadding = PaddingValues(horizontal = Dimens.ScreenPadding, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    items(r.series, key = { it.seriesId }) { se ->
                                        PosterCard(se.name, se.coverUrl, { navigator.openSeries(se.seriesId) }, Modifier.width(170.dp),
                                            subtitle = se.year, rating = se.rating, fallbackIcon = Icons.Rounded.VideoLibrary,
                                            isFavorite = FavoriteItem.keyOf(ContentType.SERIES, se.seriesId) in favorites)
                                    }
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
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(start = Dimens.ScreenPadding, top = 16.dp, bottom = 4.dp))
}

