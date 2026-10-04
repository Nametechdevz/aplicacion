package com.webpro.player.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webpro.player.R
import com.webpro.player.domain.model.Category
import com.webpro.player.ui.theme.WebProColors

/** Vertical category list used on TV and large screens. */
@Composable
fun CategorySidebar(
    categories: List<Category>,
    selectedId: String,
    onSelect: (Category) -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()
    LaunchedEffect(categories) {
        val index = categories.indexOfFirst { it.id == selectedId }
        if (index > 0) listState.scrollToItem(index)
    }
    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = PaddingValues(vertical = 4.dp, horizontal = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(categories, key = { it.id }) { category ->
            val selected = category.id == selectedId
            FocusableCard(
                onClick = { onSelect(category) },
                focusedScale = 1.03f,
                shape = MaterialTheme.shapes.small,
                containerColor = if (selected) WebProColors.Primary.copy(alpha = 0.22f) else MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = categoryLabel(category),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        color = if (selected) WebProColors.TextPrimary else WebProColors.TextSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

/** Horizontal category chips used on phones. */
@Composable
fun CategoryChips(
    categories: List<Category>,
    selectedId: String,
    onSelect: (Category) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp)
) {
    val listState = rememberLazyListState()
    LaunchedEffect(categories) {
        val index = categories.indexOfFirst { it.id == selectedId }
        if (index > 0) listState.scrollToItem(index)
    }
    LazyRow(
        state = listState,
        modifier = modifier.fillMaxWidth(),
        contentPadding = contentPadding,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(categories, key = { it.id }) { category ->
            FilterChip(
                selected = category.id == selectedId,
                onClick = { onSelect(category) },
                label = { Text(categoryLabel(category), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = WebProColors.Primary,
                    selectedLabelColor = WebProColors.TextPrimary,
                    containerColor = WebProColors.Surface,
                    labelColor = WebProColors.TextSecondary
                )
            )
        }
    }
}

/** Display name of a category, translating the virtual ones. */
@Composable
fun categoryLabel(category: Category): String = when (category.id) {
    Category.ALL_ID -> stringResource(R.string.category_all)
    Category.FAVORITES_ID -> stringResource(R.string.category_favorites)
    else -> category.name
}
