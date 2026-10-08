package com.nametech.inventario.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.Category
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.accountTimeState
import com.nametech.inventario.domain.daysLeft
import com.nametech.inventario.domain.daysText
import com.nametech.inventario.domain.effectiveExpiration
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.CategoryAvatar
import com.nametech.inventario.ui.components.EmptyState
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.components.timeColor
import com.nametech.inventario.util.Fmt

private enum class ReminderTab(val label: String) {
    DUE_SOON("Por vencer"),
    EXPIRED("Vencidos"),
    UNPAID("Por cobrar"),
    SUPPLIER("Cuentas proveedor"),
}

@Composable
fun RemindersScreen(vm: AppViewModel, nav: Nav) {
    val items by vm.items.collectAsState()
    val clients by vm.clients.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    val context = LocalContext.current
    var tab by rememberSaveable { mutableStateOf(ReminderTab.DUE_SOON) }

    ScreenScaffold(title = "Avisos y recordatorios") { padding ->
        val all = items
        if (all == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ScreenScaffold
        }
        val clientsById = clients.orEmpty().associateBy { it.id }
        val sold = all.filter { it.status == ItemStatus.SOLD }
        val lists = mapOf(
            ReminderTab.DUE_SOON to sold.filter { it.timeState(today, s.dueSoonDays) == TimeState.DUE_SOON }
                .sortedBy { it.effectiveExpiration() },
            ReminderTab.EXPIRED to sold.filter { it.timeState(today, s.dueSoonDays) == TimeState.EXPIRED }
                .sortedByDescending { it.effectiveExpiration() },
            ReminderTab.UNPAID to sold.filter { !it.paid }.sortedBy { it.saleDate },
            ReminderTab.SUPPLIER to all.filter {
                it.status != ItemStatus.INACTIVE &&
                    it.accountTimeState(today, s.dueSoonDays).let { st -> st == TimeState.DUE_SOON || st == TimeState.EXPIRED }
            }.sortedBy { it.expirationDate },
        )
        val current = lists[tab].orEmpty()

        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(ReminderTab.entries) { t ->
                    FilterChip(selected = tab == t, onClick = { tab = t }, label = { Text("${t.label} (${lists[t].orEmpty().size})") })
                }
            }
            if (current.isEmpty()) {
                EmptyState(Icons.Filled.CheckCircle, "¡Todo al día!", "No hay pendientes en esta sección")
                return@Column
            }
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(current, key = { it.id }) { item ->
                    val client = item.clientId?.let { clientsById[it] }
                    ReminderCard(
                        item = item,
                        title = client?.name ?: item.supplier.ifBlank { "Sin cliente" },
                        dateText = when (tab) {
                            ReminderTab.SUPPLIER -> "Cuenta: " + daysText(item.expirationDate?.minus(today)) + " · " + Fmt.date(item.expirationDate)
                            ReminderTab.UNPAID -> "Debe ${Fmt.money(item.salePrice, s)} · vendido el ${Fmt.date(item.saleDate)}"
                            else -> daysText(item.daysLeft(today)) + " · " + Fmt.date(item.effectiveExpiration())
                        },
                        state = if (tab == ReminderTab.SUPPLIER) item.accountTimeState(today, s.dueSoonDays) else item.timeState(today, s.dueSoonDays),
                        lastReminder = item.lastReminderAt,
                        onOpen = { nav.item(item.id) },
                    ) {
                        when (tab) {
                            ReminderTab.DUE_SOON, ReminderTab.EXPIRED -> {
                                Button(onClick = { sendReminder(context, vm, s, today, item, client) }) {
                                    Icon(Icons.AutoMirrored.Filled.Send, null); SpacerW(6); Text("Recordar")
                                }
                                OutlinedButton(onClick = { nav.item(item.id) }) { Text("Renovar / ver") }
                            }
                            ReminderTab.UNPAID -> {
                                Button(onClick = { sendPaymentReminder(context, s, today, item, client) }) {
                                    Icon(Icons.AutoMirrored.Filled.Send, null); SpacerW(6); Text("Cobrar")
                                }
                                OutlinedButton(onClick = { vm.launch { vm.repo.setPaid(item, true) } }) {
                                    Icon(Icons.Filled.Paid, null); SpacerW(6); Text("Pagado")
                                }
                            }
                            ReminderTab.SUPPLIER -> {
                                OutlinedButton(onClick = { nav.item(item.id) }) { Text("Renovar cuenta") }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReminderCard(
    item: Item,
    title: String,
    dateText: String,
    state: TimeState,
    lastReminder: Long?,
    onOpen: () -> Unit,
    actions: @Composable () -> Unit,
) {
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CategoryAvatar(Category.of(item.category), 40)
                SpacerW(12)
                Column(Modifier.weight(1f)) {
                    Text(title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        item.name + if (item.plan.isNotBlank()) " · ${item.plan}" else "",
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(dateText, color = timeColor(state), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
                    if (lastReminder != null) {
                        Text(
                            "Recordado: ${Fmt.dateTime(lastReminder)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { actions() }
        }
    }
}
