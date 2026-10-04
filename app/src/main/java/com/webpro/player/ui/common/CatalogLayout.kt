package com.webpro.player.ui.common

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webpro.player.R
import com.webpro.player.domain.model.Category
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.components.CategoryChips
import com.webpro.player.ui.components.CategorySidebar
import com.webpro.player.ui.components.EmptyView
import com.webpro.player.ui.components.ErrorView
import com.webpro.player.ui.components.ScreenHeader
import com.webpro.player.ui.components.SearchField

/**
 * Common layout of the catalog sections: header, search, categories (sidebar on
 * TV/large screens, chips on phones) and a content area with explicit
 * Loading / Success / Empty / Error states.
 */
@Composable
fun <T> CatalogLayout(
    title: String,
    searchPlaceholder: String,
    categories: List<Category>,
    selectedCategoryId: String,
    onSelectCategory: (Category) -> Unit,
    query: String,
    onQueryChange: (String) -> Unit,
    state: UiState<List<T>>,
    onRetry: () -> Unit,
    onRefresh: () -> Unit,
    emptyTitle: String,
    emptyMessage: String,
    loading: @Composable () -> Unit,
    content: @Composable (List<T>) -> Unit
) {
    val device = LocalDeviceProfile.current
    val padding = device.screenPadding
    val count = (state as? UiState.Success)?.data?.size
    Column(Modifier.fillMaxSize()) {
        ScreenHeader(
            title = title,
            subtitle = count?.let { pluralStringResource(R.plurals.items_count, it, it) },
            modifier = Modifier.padding(start = padding, end = padding / 2, top = padding / 2),
            actions = {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Rounded.Refresh, contentDescription = stringResource(R.string.action_refresh))
                }
            }
        )
        Spacer(Modifier.height(10.dp))
        SearchField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = searchPlaceholder,
            modifier = Modifier.padding(horizontal = padding)
        )
        Spacer(Modifier.height(12.dp))
        if (device.useSideCategories) {
            Row(Modifier.fillMaxSize()) {
                CategorySidebar(
                    categories = categories,
                    selectedId = selectedCategoryId,
                    onSelect = onSelectCategory,
                    modifier = Modifier
                        .width(if (device.isTv) 280.dp else 250.dp)
                        .fillMaxHeight()
                        .padding(start = padding - 4.dp, bottom = 8.dp)
                )
                Spacer(Modifier.width(12.dp))
                StateContent(state, onRetry, emptyTitle, emptyMessage, loading, content, Modifier.padding(end = padding))
            }
        } else {
            CategoryChips(
                categories = categories,
                selectedId = selectedCategoryId,
                onSelect = onSelectCategory,
                contentPadding = PaddingValues(horizontal = padding)
            )
            Spacer(Modifier.height(10.dp))
            StateContent(state, onRetry, emptyTitle, emptyMessage, loading, content, Modifier.padding(horizontal = padding))
        }
    }
}

@Composable
private fun <T> StateContent(
    state: UiState<List<T>>,
    onRetry: () -> Unit,
    emptyTitle: String,
    emptyMessage: String,
    loading: @Composable () -> Unit,
    content: @Composable (List<T>) -> Unit,
    modifier: Modifier
) {
    Column(modifier.fillMaxSize()) {
        when (state) {
            UiState.Loading -> loading()
            UiState.Empty -> EmptyView(title = emptyTitle, message = emptyMessage)
            is UiState.Error -> ErrorView(message = state.error.message(), onRetry = onRetry)
            is UiState.Success -> content(state.data)
        }
    }
}
