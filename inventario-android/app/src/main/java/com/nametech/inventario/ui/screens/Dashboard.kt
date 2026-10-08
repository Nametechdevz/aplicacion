package com.nametech.inventario.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.MoneyOff
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.SaleKind
import com.nametech.inventario.domain.Category
import com.nametech.inventario.domain.Filter
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.effectiveExpiration
import com.nametech.inventario.domain.Stock
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.CategoryAvatar
import com.nametech.inventario.ui.components.LabeledValue
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SectionCard
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.theme.Amber
import com.nametech.inventario.ui.theme.Blue
import com.nametech.inventario.ui.theme.Green
import com.nametech.inventario.ui.theme.Red
import com.nametech.inventario.util.Fmt
import java.time.LocalDate

@Composable
fun DashboardScreen(vm: AppViewModel, nav: Nav) {
    val items by vm.items.collectAsState()
    val clients by vm.clients.collectAsState()
    val sales by vm.sales.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()

    ScreenScaffold(
        title = s.businessName,
        fab = {
            ExtendedFloatingActionButton(
                onClick = { nav.editItem() },
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Agregar") },
            )
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
        fun count(f: Filter) = stock.count(f, today, s.dueSoonDays)

        val firstOfMonth = LocalDate.ofEpochDay(today).withDayOfMonth(1).toEpochDay()
        val monthSales = sales.filter { it.date in firstOfMonth..today }
        val monthIncome = monthSales.sumOf { it.amount }
        val monthCost = monthSales.sumOf { it.cost }
        val totalIncome = sales.sumOf { it.amount }
        val totalProfit = sales.sumOf { it.amount - it.cost }
        val unpaid = all.filter { it.status == ItemStatus.SOLD && !it.paid }
        val stockValue = all.filter { stock.matches(it, Filter.AVAILABLE, today, s.dueSoonDays) }.sumOf { item ->
            if (stock.hasProfiles(item)) {
                // Cuenta libre completa: vale lo que el mayor entre venderla entera o por perfiles.
                val free = stock.freeProfiles(item)
                if (stock.canSellFull(item)) maxOf(item.suggestedPrice, free.sumOf { it.suggestedPrice }) else free.sumOf { it.suggestedPrice }
            } else {
                item.suggestedPrice
            }
        }
        val upcoming = all
            .filter { it.status != ItemStatus.INACTIVE && it.effectiveExpiration() != null }
            .filter { it.timeState(today, s.dueSoonDays).let { st -> st == TimeState.DUE_SOON || st == TimeState.EXPIRED } }
            .sortedBy { it.effectiveExpiration() }
            .take(6)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("Disponibles", count(Filter.AVAILABLE), Icons.Filled.CheckCircle, Green, Modifier.weight(1f)) {
                        vm.inventoryFilter = Filter.AVAILABLE; vm.inventoryCategory = null; nav.tab("inventory")
                    }
                    StatCard("Vendidas", count(Filter.SOLD), Icons.Filled.Sell, Blue, Modifier.weight(1f)) {
                        vm.inventoryFilter = Filter.SOLD; vm.inventoryCategory = null; nav.tab("inventory")
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("Por vencer", count(Filter.DUE_SOON), Icons.Filled.Schedule, Amber, Modifier.weight(1f)) {
                        vm.inventoryFilter = Filter.DUE_SOON; vm.inventoryCategory = null; nav.tab("inventory")
                    }
                    StatCard("Vencidas", count(Filter.EXPIRED), Icons.Filled.Warning, Red, Modifier.weight(1f)) {
                        vm.inventoryFilter = Filter.EXPIRED; vm.inventoryCategory = null; nav.tab("inventory")
                    }
                }
            }
            if (unpaid.isNotEmpty()) {
                item {
                    StatCard(
                        "Por cobrar · ${Fmt.money(unpaid.sumOf { it.salePrice }, s)}",
                        unpaid.size,
                        Icons.Filled.MoneyOff,
                        Red,
                        Modifier.fillMaxWidth(),
                    ) { vm.inventoryFilter = Filter.UNPAID; vm.inventoryCategory = null; nav.tab("inventory") }
                }
            }
            item {
                SectionCard("Finanzas del mes") {
                    Row {
                        LabeledValue("Ventas", monthSales.count { it.kind == SaleKind.SALE }.toString(), Modifier.weight(1f))
                        LabeledValue("Renovaciones", monthSales.count { it.kind == SaleKind.RENEWAL }.toString(), Modifier.weight(1f))
                    }
                    SpacerH(12)
                    Row {
                        LabeledValue("Ingresos", Fmt.money(monthIncome, s), Modifier.weight(1f), Blue)
                        LabeledValue("Ganancia", Fmt.money(monthIncome - monthCost, s), Modifier.weight(1f), Green)
                    }
                    SpacerH(12)
                    HorizontalDivider()
                    SpacerH(12)
                    Row {
                        LabeledValue("Ingresos totales", Fmt.money(totalIncome, s), Modifier.weight(1f))
                        LabeledValue("Ganancia total", Fmt.money(totalProfit, s), Modifier.weight(1f))
                    }
                    SpacerH(12)
                    Row {
                        LabeledValue("Stock (precio sugerido)", Fmt.money(stockValue, s), Modifier.weight(1f))
                        LabeledValue("Clientes", clients.orEmpty().size.toString(), Modifier.weight(1f))
                    }
                }
            }
            if (upcoming.isNotEmpty()) {
                item {
                    SectionCard("Atención: vencimientos", action = {
                        TextButton(onClick = { nav.tab("reminders") }) { Text("Ver avisos") }
                    }) {
                        upcoming.forEach { item ->
                            ItemRowCompact(item, clientNames[item.clientId], today, s.dueSoonDays) { nav.item(item.id) }
                        }
                    }
                }
            }
            item {
                SectionCard("Inventario por categoría") {
                    val active = all.filter { it.status != ItemStatus.INACTIVE }
                    if (active.isEmpty()) {
                        Text("Aún no tienes productos. Toca «Agregar» para empezar.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Category.entries.forEach { cat ->
                        val ofCat = active.filter { it.category == cat.name }
                        if (ofCat.isEmpty()) return@forEach
                        val sold = ofCat.count { it.status == ItemStatus.SOLD }
                        val available = ofCat.count { stock.matches(it, Filter.AVAILABLE, today, s.dueSoonDays) }
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { vm.inventoryFilter = Filter.ALL; vm.inventoryCategory = cat.name; nav.tab("inventory") }
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CategoryAvatar(cat, 36)
                            SpacerW(12)
                            Column(Modifier.weight(1f)) {
                                Row {
                                    Text(cat.label, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    Text("$available disp. · $sold vend.", style = MaterialTheme.typography.bodySmall)
                                }
                                SpacerH(4)
                                LinearProgressIndicator(
                                    progress = { if (ofCat.isEmpty()) 0f else sold.toFloat() / ofCat.size },
                                    modifier = Modifier.fillMaxWidth().height(6.dp),
                                    color = Blue,
                                    trackColor = Green.copy(alpha = 0.3f),
                                    strokeCap = StrokeCap.Round,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatCard(
    label: String,
    value: Int,
    icon: ImageVector,
    color: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(32.dp))
            SpacerW(12)
            Column {
                Text(value.toString(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = color)
                Text(label, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}
