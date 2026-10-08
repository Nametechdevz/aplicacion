package com.nametech.inventario.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.displayName
import com.nametech.inventario.domain.Category
import com.nametech.inventario.domain.Filter
import com.nametech.inventario.domain.SortOrder
import com.nametech.inventario.domain.daysLeft
import com.nametech.inventario.domain.daysText
import com.nametech.inventario.domain.Stock
import com.nametech.inventario.domain.matchesQuery
import com.nametech.inventario.domain.sortedWithOrder
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.CategoryAvatar
import com.nametech.inventario.ui.components.EmptyState
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.components.StatusBadges
import com.nametech.inventario.ui.components.timeColor
import com.nametech.inventario.util.Fmt

@Composable
fun InventoryScreen(vm: AppViewModel, nav: Nav) {
    val items by vm.items.collectAsState()
    val clients by vm.clients.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf(SortOrder.EXPIRATION) }
    var sortMenu by rememberSaveable { mutableStateOf(false) }

    ScreenScaffold(
        title = "Inventario",
        actions = {
            Box {
                IconButton(onClick = { sortMenu = true }) { Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Ordenar") }
                DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                    SortOrder.entries.forEach { o ->
                        DropdownMenuItem(
                            text = { Text(o.label) },
                            leadingIcon = { RadioButton(selected = sort == o, onClick = null) },
                            onClick = { sort = o; sortMenu = false },
                        )
                    }
                }
            }
        },
        fab = {
            FloatingActionButton(onClick = { nav.editItem() }) { Icon(Icons.Filled.Add, contentDescription = "Agregar") }
        },
    ) { padding ->
        val loaded = items
        if (loaded == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ScreenScaffold
        }
        val stock = Stock(loaded)
        val all = stock.visible
        val clientNames = clients.orEmpty().associate { it.id to it.name }
        val byCategory = all.filter { vm.inventoryCategory == null || it.category == vm.inventoryCategory }
        val visible = byCategory
            .filter { stock.matches(it, vm.inventoryFilter, today, s.dueSoonDays) }
            .filter { it.matchesQuery(query, clientNames[it.clientId]) }
            .sortedWithOrder(sort)

        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar servicio, correo, cliente…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = if (query.isNotEmpty()) {
                    { IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Clear, contentDescription = "Limpiar") } }
                } else null,
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            )
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(Filter.entries) { f ->
                    val n = stock.count(f, today, s.dueSoonDays, byCategory)
                    FilterChip(
                        selected = vm.inventoryFilter == f,
                        onClick = { vm.inventoryFilter = f },
                        label = { Text("${f.label} ($n)") },
                    )
                }
            }
            val presentCategories = Category.entries.filter { c -> all.any { it.category == c.name } }
            if (presentCategories.size > 1) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        FilterChip(
                            selected = vm.inventoryCategory == null,
                            onClick = { vm.inventoryCategory = null },
                            label = { Text("Todas las categorías") },
                        )
                    }
                    items(presentCategories) { c ->
                        FilterChip(
                            selected = vm.inventoryCategory == c.name,
                            onClick = { vm.inventoryCategory = if (vm.inventoryCategory == c.name) null else c.name },
                            label = { Text(c.label) },
                        )
                    }
                }
            }
            if (visible.isEmpty()) {
                EmptyState(
                    Icons.Filled.Inventory2,
                    if (all.isEmpty()) "Tu inventario está vacío" else "Nada por aquí",
                    if (all.isEmpty()) "Agrega tu primera cuenta, curso o sistema con el botón +" else "No hay productos con este filtro",
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(visible, key = { it.id }) { item ->
                        ItemCard(item, clientNames[item.clientId], today, s.dueSoonDays, profilesSummary(stock, item)) { nav.item(item.id) }
                    }
                }
            }
        }
    }
}

@Composable
fun ItemCard(
    item: Item,
    clientName: String?,
    today: Long,
    dueSoonDays: Int,
    profilesInfo: String? = null,
    onClick: () -> Unit,
) {
    val category = Category.of(item.category)
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            CategoryAvatar(category)
            SpacerW(12)
            Column(Modifier.weight(1f)) {
                Text(
                    item.name + if (item.plan.isNotBlank()) " · ${item.plan}" else "",
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val sub = listOf(item.accessUser, item.profilePin).filter { it.isNotBlank() }.joinToString(" · ")
                if (sub.isNotEmpty()) {
                    Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (item.status == ItemStatus.SOLD && clientName != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Person, contentDescription = null, modifier = Modifier.padding(end = 4.dp).size(14.dp), tint = MaterialTheme.colorScheme.primary)
                        Text(clientName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                    }
                }
                if (profilesInfo != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Groups, contentDescription = null, modifier = Modifier.padding(end = 4.dp).size(14.dp), tint = MaterialTheme.colorScheme.secondary)
                        Text(profilesInfo, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.SemiBold)
                    }
                }
                Row(Modifier.padding(top = 4.dp)) { StatusBadges(item, today, dueSoonDays) }
            }
            if (item.status != ItemStatus.INACTIVE) {
                Column(horizontalAlignment = Alignment.End) {
                    val days = item.daysLeft(today)
                    Text(
                        daysText(days),
                        style = MaterialTheme.typography.labelMedium,
                        color = timeColor(item.timeState(today, dueSoonDays)),
                        fontWeight = FontWeight.Bold,
                    )
                    if (days != null) {
                        Text(Fmt.date(today + days), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** "Cuenta completa · 3/5 perfiles libres" para las cuentas con perfiles. */
fun profilesSummary(stock: Stock, item: Item): String? {
    if (!stock.hasProfiles(item)) return null
    val total = stock.profilesOf(item).size
    return when {
        item.status == ItemStatus.SOLD -> "Cuenta completa vendida · $total perfiles"
        else -> "Cuenta completa · ${stock.freeProfiles(item).size}/$total perfiles libres"
    }
}

/** Fila compacta para listas dentro de tarjetas (panel, detalle de cliente). */
@Composable
fun ItemRowCompact(item: Item, clientName: String?, today: Long, dueSoonDays: Int, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CategoryAvatar(Category.of(item.category), 36)
        SpacerW(12)
        Column(Modifier.weight(1f)) {
            Text(item.displayName(), fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                clientName ?: item.accessUser.ifBlank { "Sin cliente" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
        Text(
            daysText(item.daysLeft(today)),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = timeColor(item.timeState(today, dueSoonDays)),
        )
    }
}
