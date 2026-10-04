package com.webpro.player.ui.live

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.navigation.ContentNavigator
import com.webpro.player.ui.common.CatalogLayout
import com.webpro.player.ui.components.ChannelRow
import com.webpro.player.ui.components.SkeletonList

@Composable
fun LiveTvScreen(
    navigator: ContentNavigator,
    viewModel: LiveTvViewModel = viewModel(factory = LiveTvViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val categories by viewModel.categories.collectAsStateWithLifecycle()
    val selected by viewModel.selectedCategoryId.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val favorites by viewModel.favoriteKeys.collectAsStateWithLifecycle()

    CatalogLayout(
        title = stringResource(R.string.section_live),
        searchPlaceholder = stringResource(R.string.live_search_hint),
        categories = categories,
        selectedCategoryId = selected,
        onSelectCategory = viewModel::selectCategory,
        query = query,
        onQueryChange = viewModel::onQueryChange,
        state = state,
        onRetry = { viewModel.load(forceRefresh = true) },
        onRefresh = { viewModel.load(forceRefresh = true) },
        emptyTitle = stringResource(R.string.live_empty_title),
        emptyMessage = stringResource(R.string.live_empty_message),
        loading = { SkeletonList() }
    ) { channels ->
        val listState = rememberLazyListState()
        LaunchedEffect(selected) { listState.scrollToItem(0) }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp, start = 4.dp, end = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(channels, key = { it.streamId }, contentType = { "channel" }) { channel ->
                ChannelRow(
                    channel = channel,
                    isFavorite = viewModel.isFavorite(channel, favorites),
                    onClick = { navigator.playChannel(channel.streamId, channel.name, selected) },
                    onToggleFavorite = { viewModel.toggleFavorite(channel) }
                )
            }
        }
    }
}

