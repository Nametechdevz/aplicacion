package com.webpro.player.ui.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.VideoLibrary
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
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
import com.webpro.player.ui.theme.WebProColors

@Composable
fun FavoritesScreen(
    navigator: ContentNavigator,
    viewModel: FavoritesViewModel = viewModel(factory = FavoritesViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val selectedType by viewModel.selectedType.collectAsStateWithLifecycle()
    val counts by viewModel.counts.collectAsStateWithLifecycle()
    val device = LocalDeviceProfile.current
    val padding = device.screenPadding

    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            title = stringResource(R.string.section_favorites),
            subtitle = stringResource(R.string.favorites_subtitle),
            modifier = Modifier.padding(start = padding, end = padding, top = padding / 2)
        )
        Spacer(Modifier.height(12.dp))
        val tabs = listOf(
            ContentType.LIVE to R.string.favorites_tab_channels,
            ContentType.MOVIE to R.string.favorites_tab_movies,
            ContentType.SERIES to R.string.favorites_tab_series
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = padding),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(tabs, key = { it.first.name }) { (type, label) ->
                FilterChip(
                    selected = type == selectedType,
                    onClick = { viewModel.select(type) },
                    label = { Text("${stringResource(label)} (${counts[type] ?: 0})") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = WebProColors.Primary,
                        selectedLabelColor = WebProColors.TextPrimary,
                        containerColor = WebProColors.Surface
                    )
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        when (val current = state) {
            UiState.Loading -> LoadingView()
            UiState.Empty -> EmptyView(
                title = stringResource(R.string.favorites_empty_title),
                message = stringResource(R.string.favorites_empty_message),
                icon = Icons.Rounded.StarBorder
            )
            is UiState.Error -> ErrorView(message = current.error.message(), onRetry = null)
            is UiState.Success -> FavoritesGrid(
                items = current.data,
                type = selectedType,
                navigator = navigator,
                onRemove = viewModel::remove,
                modifier = Modifier.padding(horizontal = padding)
            )
        }
    }
}

@Composable
private fun FavoritesGrid(
    items: List<FavoriteItem>,
    type: ContentType,
    navigator: ContentNavigator,
    onRemove: (FavoriteItem) -> Unit,
    modifier: Modifier
) {
    val device = LocalDeviceProfile.current
    val isChannels = type == ContentType.LIVE
    LazyVerticalGrid(
        columns = if (isChannels) GridCells.Adaptive(if (device.isCompact) 300.dp else 420.dp)
        else GridCells.Adaptive(device.posterMinWidth),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp, start = 4.dp, end = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(if (isChannels) 8.dp else 14.dp)
    ) {
        items(items, key = { it.key }) { item ->
            when (item.type) {
                ContentType.LIVE -> ChannelRow(
                    channel = LiveChannel(
                        streamId = item.id,
                        number = 0,
                        name = item.name,
                        logoUrl = item.imageUrl,
                        categoryId = item.categoryId,
                        epgChannelId = null,
                        hasArchive = false
                    ),
                    isFavorite = true,
                    onClick = { navigator.playChannel(item.id, item.name, Category.FAVORITES_ID) },
                    onToggleFavorite = { onRemove(item) }
                )
                ContentType.MOVIE -> PosterCard(
                    title = item.name,
                    imageUrl = item.imageUrl,
                    isFavorite = true,
                    onClick = { navigator.openMovie(item.id) },
                    onLongClick = { onRemove(item) }
                )
                ContentType.SERIES -> PosterCard(
                    title = item.name,
                    imageUrl = item.imageUrl,
                    isFavorite = true,
                    fallbackIcon = Icons.Rounded.VideoLibrary,
                    onClick = { navigator.openSeries(item.id) },
                    onLongClick = { onRemove(item) }
                )
                ContentType.EPISODE -> Unit
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }, key = "hint") {
            Text(
                stringResource(R.string.favorites_hint),
                color = WebProColors.TextMuted,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}
