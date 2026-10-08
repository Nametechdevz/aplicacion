package com.nametech.inventario.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.SaleKind
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.effectiveExpiration
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.ConfirmDialog
import com.nametech.inventario.ui.components.EmptyState
import com.nametech.inventario.ui.components.InfoRow
import com.nametech.inventario.ui.components.LabeledValue
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SectionCard
import com.nametech.inventario.ui.components.SimpleField
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.components.timeColor
import com.nametech.inventario.ui.theme.Green
import com.nametech.inventario.ui.theme.Red
import com.nametech.inventario.util.Fmt
import com.nametech.inventario.util.WhatsApp
import com.nametech.inventario.util.dial
import kotlinx.coroutines.launch

@Composable
private fun Initials(name: String, size: Int = 44) {
    val initials = name.trim().split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    Box(
        Modifier
            .size(size.dp)
            .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials.ifEmpty { "?" }, color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ClientsScreen(vm: AppViewModel, nav: Nav) {
    val clients by vm.clients.collectAsState()
    val items by vm.items.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }

    ScreenScaffold(
        title = "Clientes",
        fab = { FloatingActionButton(onClick = { nav.editClient() }) { Icon(Icons.Filled.PersonAdd, contentDescription = "Nuevo cliente") } },
    ) { padding ->
        val all = clients
        if (all == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ScreenScaffold
        }
        val byClient = items.orEmpty().filter { it.status == ItemStatus.SOLD }.groupBy { it.clientId }
        val visible = all.filter {
            query.isBlank() || it.name.contains(query, true) || it.whatsapp.contains(query) || it.email.contains(query, true)
        }
        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding())) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Buscar por nombre o número") },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                trailingIcon = if (query.isNotEmpty()) {
                    { IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Clear, "Limpiar") } }
                } else null,
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            if (visible.isEmpty()) {
                EmptyState(Icons.Filled.People, if (all.isEmpty()) "Sin clientes todavía" else "Sin resultados", "Los clientes se crean al vender o con el botón +")
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(visible, key = { it.id }) { c ->
                        val services = byClient[c.id].orEmpty()
                        val worst = services.map { it.timeState(today, s.dueSoonDays) }.let { states ->
                            when {
                                TimeState.EXPIRED in states -> TimeState.EXPIRED
                                TimeState.DUE_SOON in states -> TimeState.DUE_SOON
                                else -> null
                            }
                        }
                        Card(
                            onClick = { nav.client(c.id) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                        ) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Initials(c.name)
                                SpacerW(12)
                                Column(Modifier.weight(1f)) {
                                    Text(c.name, fontWeight = FontWeight.Bold)
                                    Text(
                                        c.whatsapp.ifBlank { "Sin WhatsApp" } + " · ${services.size} servicio(s)",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    if (worst != null) {
                                        Text(
                                            if (worst == TimeState.EXPIRED) "Tiene servicios vencidos" else "Tiene servicios por vencer",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = timeColor(worst),
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                                if (c.whatsapp.isNotBlank()) {
                                    val context = LocalContext.current
                                    IconButton(onClick = { WhatsApp.open(context, c.whatsapp, "", s) }) {
                                        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "WhatsApp", tint = Green)
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
fun ClientDetailScreen(vm: AppViewModel, nav: Nav, id: Long) {
    val clients by vm.clients.collectAsState()
    val items by vm.items.collectAsState()
    val sales by vm.sales.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    val context = LocalContext.current
    var confirmDelete by remember { mutableStateOf(false) }

    val client = clients?.firstOrNull { it.id == id }
    val loaded = clients != null
    LaunchedEffect(loaded, client == null) { if (loaded && client == null) nav.back() }
    if (client == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val services = items.orEmpty().filter { it.clientId == client.id && it.status == ItemStatus.SOLD }
        .sortedWith(compareBy(nullsLast<Long>()) { it.effectiveExpiration() })
    val history = sales.filter { it.clientId == client.id }

    ScreenScaffold(
        title = client.name,
        onBack = { nav.back() },
        actions = {
            IconButton(onClick = { nav.editClient(client.id) }) { Icon(Icons.Filled.Edit, "Editar") }
            IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, "Eliminar", tint = Red) }
        },
    ) { padding ->
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Initials(client.name, 56)
                        SpacerW(12)
                        Column(Modifier.weight(1f)) {
                            Text(client.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            if (client.whatsapp.isNotBlank()) Text(client.whatsapp)
                            if (client.email.isNotBlank()) Text(client.email, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    SpacerH(12)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { WhatsApp.open(context, client.whatsapp, "Hola ${client.name} 👋", s) }, enabled = client.whatsapp.isNotBlank()) {
                            Icon(Icons.AutoMirrored.Filled.Chat, null); SpacerW(6); Text("WhatsApp")
                        }
                        OutlinedButton(onClick = { context.dial(client.whatsapp) }, enabled = client.whatsapp.isNotBlank()) {
                            Icon(Icons.Filled.Call, null); SpacerW(6); Text("Llamar")
                        }
                    }
                    if (client.notes.isNotBlank()) {
                        SpacerH(8)
                        InfoRow("Notas", client.notes)
                    }
                }
            }
            item {
                SectionCard {
                    Row {
                        LabeledValue("Servicios activos", services.size.toString(), Modifier.weight(1f))
                        LabeledValue("Total comprado", Fmt.money(history.sumOf { it.amount }, s), Modifier.weight(1f), Green)
                    }
                    val unpaid = services.filter { !it.paid }
                    if (unpaid.isNotEmpty()) {
                        SpacerH(8)
                        Text("Debe: ${Fmt.money(unpaid.sumOf { it.salePrice }, s)}", color = Red, fontWeight = FontWeight.Bold)
                    }
                }
            }
            item {
                SectionCard("Servicios") {
                    if (services.isEmpty()) Text("Sin servicios activos", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    services.forEach { item ->
                        ItemRowCompact(item, item.accessUser.ifBlank { null }, today, s.dueSoonDays) { nav.item(item.id) }
                        val st = item.timeState(today, s.dueSoonDays)
                        if (st == TimeState.DUE_SOON || st == TimeState.EXPIRED) {
                            FilledTonalButton(
                                onClick = { sendReminder(context, vm, s, today, item, client) },
                                modifier = Modifier.padding(start = 48.dp, bottom = 4.dp),
                            ) { Text("Enviar recordatorio") }
                        }
                    }
                }
            }
            if (history.isNotEmpty()) {
                item {
                    SectionCard("Historial de compras") {
                        history.forEachIndexed { i, sale ->
                            if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(sale.itemName, fontWeight = FontWeight.SemiBold)
                                    Text(
                                        "${Fmt.date(sale.date)} · ${if (sale.kind == SaleKind.SALE) "Venta" else "Renovación"}",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
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
            "Eliminar cliente",
            "Se eliminará a ${client.name}. Sus ${services.size} servicio(s) volverán a estar disponibles. ¿Continuar?",
            confirm = "Eliminar",
            onConfirm = { vm.launch { vm.repo.deleteClient(client) } },
            onDismiss = { confirmDelete = false },
        )
    }
}

@Composable
fun ClientEditScreen(vm: AppViewModel, nav: Nav, id: Long) {
    val s by vm.settings.collectAsState()
    val scope = rememberCoroutineScope()
    val isNew = id == 0L
    var loaded by rememberSaveable { mutableStateOf(isNew) }
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var nameError by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(id) {
        if (!isNew && !loaded) {
            vm.repo.getClient(id)?.let { name = it.name; phone = it.whatsapp; email = it.email; notes = it.notes }
            loaded = true
        }
    }

    fun save() {
        if (name.isBlank()) {
            nameError = true
            return
        }
        scope.launch {
            val base = if (isNew) Client() else vm.repo.getClient(id) ?: return@launch
            val ok = vm.safe { vm.repo.saveClient(base.copy(name = name.trim(), whatsapp = phone.trim(), email = email.trim(), notes = notes.trim())) }
            if (ok != null) nav.back()
        }
    }

    ScreenScaffold(
        title = if (isNew) "Nuevo cliente" else "Editar cliente",
        onBack = { nav.back() },
        actions = { IconButton(onClick = ::save) { Icon(Icons.Filled.Check, "Guardar") } },
    ) { padding ->
        if (!loaded) return@ScreenScaffold
        Column(
            Modifier
                .fillMaxSize()
                .padding(top = padding.calculateTopPadding())
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SimpleField("Nombre *", name, { name = it; nameError = false }, leading = Icons.Filled.Person, supporting = if (nameError) "Escribe el nombre" else null)
            SimpleField(
                "WhatsApp",
                phone,
                { phone = it },
                keyboardType = KeyboardType.Phone,
                leading = Icons.Filled.Phone,
                supporting = "Ej. 3001234567 (se usa +${s.countryCode}) o +521234567890",
            )
            SimpleField("Correo", email, { email = it }, keyboardType = KeyboardType.Email, leading = Icons.Filled.Email)
            SimpleField("Notas", notes, { notes = it }, singleLine = false, minLines = 3)
            Button(onClick = ::save, modifier = Modifier.fillMaxWidth()) { Text("Guardar") }
        }
    }
}
