package com.nametech.inventario.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.Category
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.CategoryAvatar
import com.nametech.inventario.ui.components.DateField
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SectionCard
import com.nametech.inventario.ui.components.SimpleField
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.util.Fmt
import kotlinx.coroutines.launch
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SellScreen(vm: AppViewModel, nav: Nav, itemId: Long) {
    val items by vm.items.collectAsState()
    val clients by vm.clients.collectAsState()
    val s by vm.settings.collectAsState()
    val today by vm.today.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val item = items?.firstOrNull { it.id == itemId }
    if (item == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    val editing = item.status == ItemStatus.SOLD

    var initialized by rememberSaveable { mutableStateOf(false) }
    var useExisting by rememberSaveable { mutableStateOf(false) }
    var clientId by rememberSaveable { mutableStateOf<Long?>(null) }
    var clientQuery by rememberSaveable { mutableStateOf("") }
    var clientMenu by rememberSaveable { mutableStateOf(false) }
    var newName by rememberSaveable { mutableStateOf("") }
    var newPhone by rememberSaveable { mutableStateOf("") }
    var saleDate by rememberSaveable { mutableStateOf(today) }
    var clientExp by rememberSaveable { mutableStateOf<Long?>(null) }
    var price by rememberSaveable { mutableStateOf("") }
    var paid by rememberSaveable { mutableStateOf(true) }
    var sendNow by rememberSaveable { mutableStateOf(!editing) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(item.id) {
        if (initialized) return@LaunchedEffect
        if (editing) {
            useExisting = true
            clientId = item.clientId
            clientQuery = clients?.firstOrNull { it.id == item.clientId }?.name.orEmpty()
            saleDate = item.saleDate ?: today
            clientExp = item.clientExpirationDate
            price = Fmt.plain(item.salePrice)
            paid = item.paid
        } else {
            useExisting = !clients.isNullOrEmpty()
            clientExp = LocalDate.ofEpochDay(today).plusMonths(s.defaultSaleMonths.toLong()).toEpochDay()
            price = Fmt.plain(item.suggestedPrice)
        }
        initialized = true
    }

    fun save() {
        if (useExisting && clientId == null) {
            error = "Elige un cliente de la lista"
            return
        }
        if (!useExisting && newName.isBlank()) {
            error = "Escribe el nombre del cliente"
            return
        }
        scope.launch {
            val result = vm.repo.sell(
                itemId = item.id,
                clientId = if (useExisting) clientId else null,
                newClientName = newName,
                newClientPhone = newPhone,
                saleDate = saleDate,
                price = Fmt.parseMoney(price),
                clientExpiration = clientExp,
                paid = paid,
            ) ?: return@launch
            if (sendNow) sendCredentials(context, s, today, result.first, result.second)
            nav.back()
        }
    }

    ScreenScaffold(title = if (editing) "Editar venta" else "Vender", onBack = { nav.back() }) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(top = padding.calculateTopPadding())
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CategoryAvatar(Category.of(item.category))
                    SpacerW(12)
                    Column {
                        Text(item.name + if (item.plan.isNotBlank()) " · ${item.plan}" else "", fontWeight = FontWeight.Bold)
                        Text(
                            listOf(item.accessUser, item.profilePin).filter { it.isNotBlank() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            Text("Cliente", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = useExisting,
                    onClick = { useExisting = true; error = null },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                ) { Text("Existente") }
                SegmentedButton(
                    selected = !useExisting,
                    onClick = { useExisting = false; error = null },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                ) { Text("Nuevo cliente") }
            }

            if (useExisting) {
                val matches = clients.orEmpty().filter {
                    clientQuery.isBlank() || it.name.contains(clientQuery, true) || it.whatsapp.contains(clientQuery)
                }.take(30)
                ExposedDropdownMenuBox(expanded = clientMenu, onExpandedChange = { clientMenu = it }) {
                    OutlinedTextField(
                        value = clientQuery,
                        onValueChange = { clientQuery = it; clientId = null; clientMenu = true; error = null },
                        label = { Text("Buscar cliente") },
                        leadingIcon = { Icon(Icons.Filled.Person, null) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = clientMenu) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryEditable),
                    )
                    if (matches.isNotEmpty()) {
                        ExposedDropdownMenu(expanded = clientMenu, onDismissRequest = { clientMenu = false }) {
                            matches.forEach { c ->
                                DropdownMenuItem(
                                    text = { Text(c.name + if (c.whatsapp.isNotBlank()) " · ${c.whatsapp}" else "") },
                                    onClick = { clientId = c.id; clientQuery = c.name; clientMenu = false },
                                )
                            }
                        }
                    }
                }
                if (clients.isNullOrEmpty()) {
                    Text("Aún no tienes clientes guardados. Usa «Nuevo cliente».", style = MaterialTheme.typography.bodySmall)
                }
            } else {
                SimpleField("Nombre del cliente *", newName, { newName = it; error = null }, leading = Icons.Filled.Person)
                SimpleField(
                    "WhatsApp",
                    newPhone,
                    { newPhone = it },
                    keyboardType = KeyboardType.Phone,
                    leading = Icons.Filled.Phone,
                    supporting = "Sin indicativo se usa +${s.countryCode}",
                )
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Text("Venta", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            DateField("Fecha de venta", saleDate, { if (it != null) saleDate = it }, clearable = false)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(1L to "1 mes", 2L to "2 meses", 3L to "3 meses", 6L to "6 meses", 12L to "1 año").forEach { (m, label) ->
                    AssistChip(
                        onClick = { clientExp = LocalDate.ofEpochDay(saleDate).plusMonths(m).toEpochDay() },
                        label = { Text(label) },
                    )
                }
                AssistChip(onClick = { clientExp = null }, label = { Text("Sin vencimiento") })
            }
            DateField("Vence para el cliente", clientExp, { clientExp = it })
            if (item.expirationDate != null && clientExp != null && clientExp!! > item.expirationDate) {
                Text(
                    "⚠️ La cuenta con el proveedor vence antes (${Fmt.date(item.expirationDate)}).",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            SimpleField("Precio de venta (${s.currencySymbol})", price, { price = it }, keyboardType = KeyboardType.Decimal)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pagado", modifier = Modifier.weight(1f))
                Switch(checked = paid, onCheckedChange = { paid = it })
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = sendNow, onCheckedChange = { sendNow = it })
                Text("Enviar los datos por WhatsApp al guardar")
            }
            SpacerH(4)
            Button(onClick = ::save, modifier = Modifier.fillMaxWidth()) { Text(if (editing) "Guardar venta" else "Registrar venta") }
            SpacerH(24)
        }
    }
}
