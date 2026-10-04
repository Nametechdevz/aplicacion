package com.webpro.player.ui.series

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.VideoLibrary
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
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.common.CatalogLayout
import com.webpro.player.ui.components.PosterCard
import com.webpro.player.ui.components.SkeletonGrid

@Composable
fun SeriesScreen(
    navigator: ContentNavigator,
    viewModel: SeriesViewModel = viewModel(factory = SeriesViewModel.Factory)
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val categories by viewModel.categories.collectAsStateWithLifecycle()
    val selected by viewModel.selectedCategoryId.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val favorites by viewModel.favoriteKeys.collectAsStateWithLifecycle()
    val device = LocalDeviceProfile.current

    CatalogLayout(
        title = stringResource(R.string.section_series),
        searchPlaceholder = stringResource(R.string.series_search_hint),
        categories = categories,
        selectedCategoryId = selected,
        onSelectCategory = viewModel::selectCategory,
        query = query,
        onQueryChange = viewModel::onQueryChange,
        state = state,
        onRetry = { viewModel.load(forceRefresh = true) },
        onRefresh = { viewModel.load(forceRefresh = true) },
        emptyTitle = stringResource(R.string.series_empty_title),
        emptyMessage = stringResource(R.string.catalog_empty_message),
        loading = { SkeletonGrid(minItemWidth = device.posterMinWidth) }
    ) { seriesList ->
        val gridState = rememberLazyGridState()
        LaunchedEffect(selected) { gridState.scrollToItem(0) }
        LazyVerticalGrid(
            state = gridState,
            columns = GridCells.Adaptive(device.posterMinWidth),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 6.dp, bottom = 24.dp, start = 6.dp, end = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(seriesList, key = { it.seriesId }, contentType = { "series" }) { series ->
                PosterCard(
                    title = series.name,
                    imageUrl = series.coverUrl,
                    subtitle = listOfNotNull(series.year, series.genre?.substringBefore(',')).joinToString(" · "),
                    rating = series.rating,
                    isFavorite = viewModel.isFavorite(series, favorites),
                    fallbackIcon = Icons.Rounded.VideoLibrary,
                    onClick = { navigator.openSeries(series.seriesId) },
                    onLongClick = { viewModel.toggleFavorite(series) }
                )
            }
        }
    }
}
