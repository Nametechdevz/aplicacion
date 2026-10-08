package com.nametech.inventario.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FileCopy
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.SaleKind
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
import com.nametech.inventario.ui.components.ConfirmDialog
import com.nametech.inventario.ui.components.DateField
import com.nametech.inventario.ui.components.InfoRow
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SectionCard
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.components.StatusBadges
import com.nametech.inventario.ui.components.timeColor
import com.nametech.inventario.ui.theme.Green
import com.nametech.inventario.ui.theme.Red
import com.nametech.inventario.util.Fmt
import com.nametech.inventario.util.Messages
import com.nametech.inventario.util.WhatsApp
import com.nametech.inventario.util.copyToClipboard
import com.nametech.inventario.util.openUrl
import com.nametech.inventario.util.shareText
import java.time.LocalDate

/** Envía los datos de acceso al cliente por WhatsApp. */
fun sendCredentials(context: Context, s: AppSettings, today: Long, item: Item, client: Client?) {
    WhatsApp.open(context, client?.whatsapp.orEmpty(), Messages.fill(s.templateCredentials, item, client, s, today), s)
}

/** Envía el recordatorio de vencimiento (o de servicio vencido) y lo marca como enviado. */
fun sendReminder(context: Context, vm: AppViewModel, s: AppSettings, today: Long, item: Item, client: Client?) {
    val template = if (item.timeState(today, s.dueSoonDays) == TimeState.EXPIRED) s.templateExpired else s.templateReminder
    if (WhatsApp.open(context, client?.whatsapp.orEmpty(), Messages.fill(template, item, client, s, today), s)) {
        vm.launch { vm.repo.markReminded(item) }
    }
}

fun sendPaymentReminder(context: Context, s: AppSettings, today: Long, item: Item, client: Client?) {
    WhatsApp.open(context, client?.whatsapp.orEmpty(), Messages.fill(s.templatePayment, item, client, s, today), s)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ItemDetailScreen(vm: AppViewModel, nav: Nav, id: Long) {
    val items by vm.items.collectAsState()
    val clients by vm.clients.collectAsState()
    val sales by vm.sales.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    val context = LocalContext.current

    val product = items?.firstOrNull { it.id == id }
    val loaded = items != null
    LaunchedEffect(loaded, product == null) { if (loaded && product == null) nav.back() }
    if (product == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val client = product.clientId?.let { cid -> clients?.firstOrNull { it.id == cid } }
    val category = Category.of(product.category)
    val history = sales.filter { it.itemId == product.id }

    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmRelease by remember { mutableStateOf(false) }
    var showRenew by remember { mutableStateOf(false) }
    var showDuplicate by remember { mutableStateOf(false) }

    ScreenScaffold(
        title = product.name,
        onBack = { nav.back() },
        actions = {
            IconButton(onClick = { nav.editItem(product.id) }) { Icon(Icons.Filled.Edit, contentDescription = "Editar") }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "Más") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text("Duplicar") },
                        leadingIcon = { Icon(Icons.Filled.FileCopy, null) },
                        onClick = { menu = false; showDuplicate = true },
                    )
                    if (product.status == ItemStatus.INACTIVE) {
                        DropdownMenuItem(
                            text = { Text("Reactivar") },
                            leadingIcon = { Icon(Icons.Filled.Restore, null) },
                            onClick = { menu = false; vm.launch { vm.repo.setInactive(product, false) } },
                        )
                    } else {
                        DropdownMenuItem(
                            text = { Text("Dar de baja (inactiva)") },
                            leadingIcon = { Icon(Icons.Filled.Block, null) },
                            onClick = { menu = false; vm.launch { vm.repo.setInactive(product, true) } },
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Eliminar", color = Red) },
                        leadingIcon = { Icon(Icons.Filled.Delete, null, tint = Red) },
                        onClick = { menu = false; confirmDelete = true },
                    )
                }
            }
        },
    ) { padding ->
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CategoryAvatar(category, 56)
                        SpacerW(12)
                        Column(Modifier.weight(1f)) {
                            Text(product.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            if (product.plan.isNotBlank()) Text(product.plan, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(category.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    SpacerH(8)
                    StatusBadges(product, today, s.dueSoonDays)
                    if (product.status != ItemStatus.INACTIVE) {
                        SpacerH(8)
                        val exp = product.effectiveExpiration()
                        Text(
                            daysText(product.daysLeft(today)) + if (exp != null) " · ${Fmt.date(exp)}" else "",
                            color = timeColor(product.timeState(today, s.dueSoonDays)),
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }

            item {
                SectionCard("Acciones") {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        when (product.status) {
                            ItemStatus.AVAILABLE -> {
                                Button(onClick = { nav.sell(product.id) }) {
                                    Icon(Icons.Filled.Sell, null); SpacerW(6); Text("Vender")
                                }
                                OutlinedButton(onClick = { showRenew = true }) {
                                    Icon(Icons.Filled.Autorenew, null); SpacerW(6); Text("Renovar cuenta")
                                }
                            }
                            ItemStatus.SOLD -> {
                                Button(onClick = { sendCredentials(context, s, today, product, client) }) {
                                    Icon(Icons.AutoMirrored.Filled.Send, null); SpacerW(6); Text("Enviar datos")
                                }
                                FilledTonalButton(onClick = { sendReminder(context, vm, s, today, product, client) }) {
                                    Icon(Icons.Filled.NotificationsActive, null); SpacerW(6); Text("Recordatorio")
                                }
                                OutlinedButton(onClick = { showRenew = true }) {
                                    Icon(Icons.Filled.Autorenew, null); SpacerW(6); Text("Renovar")
                                }
                                OutlinedButton(onClick = { nav.sell(product.id) }) {
                                    Icon(Icons.Filled.Edit, null); SpacerW(6); Text("Editar venta")
                                }
                                if (!product.paid) {
                                    FilledTonalButton(onClick = { vm.launch { vm.repo.setPaid(product, true) } }) {
                                        Icon(Icons.Filled.Paid, null); SpacerW(6); Text("Marcar pagado")
                                    }
                                    OutlinedButton(onClick = { sendPaymentReminder(context, s, today, product, client) }) {
                                        Icon(Icons.AutoMirrored.Filled.Send, null); SpacerW(6); Text("Cobrar")
                                    }
                                }
                                OutlinedButton(onClick = { confirmRelease = true }) {
                                    Icon(Icons.Filled.Undo, null); SpacerW(6); Text("Liberar")
                                }
                            }
                            else -> {
                                Button(onClick = { vm.launch { vm.repo.setInactive(product, false) } }) {
                                    Icon(Icons.Filled.Restore, null); SpacerW(6); Text("Reactivar")
                                }
                            }
                        }
                        OutlinedButton(onClick = { context.copyToClipboard("Datos", Messages.credentialsPlain(product)) }) {
                            Icon(Icons.Filled.ContentCopy, null); SpacerW(6); Text("Copiar todo")
                        }
                        OutlinedButton(onClick = { context.shareText(Messages.credentialsPlain(product)) }) {
                            Icon(Icons.Filled.Share, null); SpacerW(6); Text("Compartir")
                        }
                    }
                }
            }

            item {
                SectionCard("Datos de acceso") {
                    InfoRow("Usuario / correo", product.accessUser, copyable = true)
                    InfoRow("Contraseña", product.accessPassword, copyable = true, secret = true)
                    InfoRow("Perfil / PIN", product.profilePin, copyable = true)
                    InfoRow("Link de acceso", product.accessUrl, copyable = true, onClick = { context.openUrl(product.accessUrl) })
                    InfoRow("Información adicional", product.extraInfo, copyable = true)
                    if (listOf(product.accessUser, product.accessPassword, product.profilePin, product.accessUrl, product.extraInfo).all { it.isBlank() }) {
                        Text("Sin datos de acceso registrados", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            if (product.status == ItemStatus.SOLD) {
                item {
                    SectionCard("Venta") {
                        if (client != null) {
                            InfoRow("Cliente", client.name, onClick = { nav.client(client.id) })
                            InfoRow("WhatsApp", client.whatsapp, copyable = true, onClick = {
                                WhatsApp.open(context, client.whatsapp, "", s)
                            })
                        }
                        InfoRow("Fecha de venta", Fmt.date(product.saleDate))
                        InfoRow("Precio de venta", Fmt.money(product.salePrice, s))
                        InfoRow("Vence (cliente)", product.clientExpirationDate?.let { Fmt.date(it) } ?: "Sin vencimiento")
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Pago: ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(if (product.paid) "Pagado" else "Pendiente", color = if (product.paid) Green else Red, fontWeight = FontWeight.Bold)
                        }
                        InfoRow("Último recordatorio", product.lastReminderAt?.let { Fmt.dateTime(it) } ?: "")
                        if (product.salePrice > 0 || product.costPrice > 0) {
                            InfoRow("Ganancia de la venta", Fmt.money(product.salePrice - product.costPrice, s))
                        }
                    }
                }
            }

            item {
                SectionCard("Compra y proveedor") {
                    InfoRow("Proveedor", product.supplier)
                    InfoRow("Costo", if (product.costPrice > 0) Fmt.money(product.costPrice, s) else "")
                    InfoRow("Precio sugerido", if (product.suggestedPrice > 0) Fmt.money(product.suggestedPrice, s) else "")
                    InfoRow("Fecha de compra", product.purchaseDate?.let { Fmt.date(it) } ?: "")
                    val accState = product.accountTimeState(today, s.dueSoonDays)
                    InfoRow(
                        "Vence la cuenta (proveedor)",
                        product.expirationDate?.let { "${Fmt.date(it)} · ${daysText(it - today)}" } ?: "Sin vencimiento",
                    )
                    if (product.status == ItemStatus.SOLD && accState != TimeState.NONE && accState != TimeState.OK) {
                        Text(
                            "⚠️ La cuenta con el proveedor ${if (accState == TimeState.EXPIRED) "ya venció" else "está por vencer"}. Renuévala para no afectar al cliente.",
                            color = timeColor(accState),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    InfoRow("Registrado", Fmt.dateTime(product.createdAt))
                }
            }

            if (product.notes.isNotBlank()) {
                item { SectionCard("Notas") { Text(product.notes) } }
            }

            if (history.isNotEmpty()) {
                item {
                    SectionCard("Historial de ventas") {
                        history.forEachIndexed { i, sale ->
                            if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(if (sale.kind == SaleKind.SALE) "Venta" else "Renovación", fontWeight = FontWeight.SemiBold)
                                    Text("${Fmt.date(sale.date)} · ${sale.clientName}", style = MaterialTheme.typography.bodySmall)
                                }
                                Text(Fmt.money(sale.amount, s), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        ConfirmDialog(
            "Eliminar producto",
            "Se eliminará «${product.name}». El historial de ventas se conserva. ¿Continuar?",
            confirm = "Eliminar",
            onConfirm = { vm.launch { vm.repo.deleteItem(product) } },
            onDismiss = { confirmDelete = false },
        )
    }
    if (confirmRelease) {
        ConfirmDialog(
            "Liberar producto",
            "El producto vuelve a estar disponible y se quita el cliente asignado. ¿Continuar?",
            confirm = "Liberar",
            onConfirm = { vm.launch { vm.repo.release(product) } },
            onDismiss = { confirmRelease = false },
        )
    }
    if (showRenew) {
        RenewDialog(product, s, today, onDismiss = { showRenew = false }) { clientExp, accountExp, amount, cost ->
            vm.launch { vm.repo.renew(product, clientExp, accountExp, amount, cost, today) }
            showRenew = false
        }
    }
    if (showDuplicate) {
        DuplicateDialog(onDismiss = { showDuplicate = false }) { n ->
            vm.launch { vm.repo.duplicate(product, n) }
            showDuplicate = false
        }
    }
}

@Composable
private fun RenewDialog(
    item: Item,
    s: AppSettings,
    today: Long,
    onDismiss: () -> Unit,
    onConfirm: (clientExp: Long?, accountExp: Long?, amount: Double, cost: Double) -> Unit,
) {
    val sold = item.status == ItemStatus.SOLD
    fun plusMonths(from: Long?, months: Long): Long {
        val base = maxOf(from ?: today, today)
        return LocalDate.ofEpochDay(base).plusMonths(months).toEpochDay()
    }
    var clientExp by remember { mutableStateOf<Long?>(if (sold) plusMonths(item.clientExpirationDate, 1) else null) }
    var accountExp by remember { mutableStateOf(if (sold) item.expirationDate else plusMonths(item.expirationDate, 1)) }
    var amount by remember { mutableStateOf(if (sold) Fmt.plain(item.salePrice) else "") }
    var cost by remember { mutableStateOf(if (sold) "" else Fmt.plain(item.costPrice)) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (sold) "Renovar servicio" else "Renovar cuenta") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1L, 2L, 3L, 6L, 12L).forEach { m ->
                        AssistChip(
                            onClick = {
                                if (sold) {
                                    clientExp = plusMonths(item.clientExpirationDate, m)
                                } else {
                                    accountExp = plusMonths(item.expirationDate, m)
                                }
                            },
                            label = { Text(if (m == 12L) "1a" else "${m}m") },
                        )
                    }
                }
                if (sold) DateField("Nuevo vencimiento (cliente)", clientExp, { clientExp = it })
                DateField("Vencimiento cuenta (proveedor)", accountExp, { accountExp = it })
                if (sold) {
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it },
                        label = { Text("Valor cobrado (${s.currencySymbol})") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                OutlinedTextField(
                    value = cost,
                    onValueChange = { cost = it },
                    label = { Text("Costo de la renovación (${s.currencySymbol})") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "Se registra en el historial para tus reportes de ingresos y ganancias.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(clientExp, accountExp, Fmt.parseMoney(amount), Fmt.parseMoney(cost)) }) { Text("Renovar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun DuplicateDialog(onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var n by remember { mutableStateOf("1") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Duplicar producto") },
        text = {
            Column {
                Text("Crea copias disponibles con los mismos datos (útil para varios perfiles de una cuenta).")
                SpacerH(8)
                OutlinedTextField(
                    value = n,
                    onValueChange = { v -> n = v.filter { it.isDigit() }.take(2) },
                    label = { Text("Cantidad de copias") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm((n.toIntOrNull() ?: 1).coerceIn(1, 50)) }) { Text("Duplicar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
