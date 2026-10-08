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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SuggestionChip
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemKind
import com.nametech.inventario.domain.Category
import com.nametech.inventario.domain.today
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.CategoryAvatar
import com.nametech.inventario.ui.components.DateField
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SimpleField
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.util.Fmt
import kotlinx.coroutines.launch
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ItemEditScreen(vm: AppViewModel, nav: Nav, id: Long) {
    val s by vm.settings.collectAsState()
    val scope = rememberCoroutineScope()
    val isNew = id == 0L

    var original by rememberSaveable { mutableStateOf<Long?>(null) }
    var loaded by rememberSaveable { mutableStateOf(isNew) }
    var category by rememberSaveable { mutableStateOf(vm.inventoryCategory ?: Category.STREAMING.name) }
    var name by rememberSaveable { mutableStateOf("") }
    var plan by rememberSaveable { mutableStateOf("") }
    var user by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var profile by rememberSaveable { mutableStateOf("") }
    var url by rememberSaveable { mutableStateOf("") }
    var extra by rememberSaveable { mutableStateOf("") }
    var supplier by rememberSaveable { mutableStateOf("") }
    var cost by rememberSaveable { mutableStateOf("") }
    var price by rememberSaveable { mutableStateOf("") }
    var purchase by rememberSaveable { mutableStateOf<Long?>(if (isNew) today() else null) }
    var expiration by rememberSaveable { mutableStateOf<Long?>(null) }
    var notes by rememberSaveable { mutableStateOf("") }
    var copies by rememberSaveable { mutableStateOf("1") }
    var nameError by rememberSaveable { mutableStateOf(false) }
    var categoryMenu by rememberSaveable { mutableStateOf(false) }
    // Cuenta completa con perfiles (solo al crear).
    var withProfiles by rememberSaveable { mutableStateOf(false) }
    var profilePrice by rememberSaveable { mutableStateOf("") }
    var profileNames by rememberSaveable { mutableStateOf(List(5) { "Perfil ${it + 1}" }) }
    var kind by rememberSaveable { mutableStateOf(ItemKind.SINGLE) }

    LaunchedEffect(id) {
        if (!isNew && original == null) {
            val it = vm.repo.getItem(id) ?: return@LaunchedEffect
            original = it.id
            category = it.category; name = it.name; plan = it.plan; user = it.accessUser
            password = it.accessPassword; profile = it.profilePin; url = it.accessUrl; extra = it.extraInfo
            supplier = it.supplier; cost = Fmt.plain(it.costPrice); price = Fmt.plain(it.suggestedPrice)
            purchase = it.purchaseDate; expiration = it.expirationDate; notes = it.notes; kind = it.kind
            loaded = true
        }
    }

    fun save() {
        if (name.isBlank()) {
            nameError = true
            return
        }
        scope.launch {
            // Se lee de nuevo para no pisar cambios de venta hechos mientras se editaba.
            val current = if (isNew) Item() else (vm.repo.getItem(id) ?: return@launch)
            val item = current.copy(
                category = category,
                name = name.trim(),
                plan = plan.trim(),
                accessUser = user.trim(),
                accessPassword = password,
                profilePin = profile.trim(),
                accessUrl = url.trim(),
                extraInfo = extra.trim(),
                supplier = supplier.trim(),
                costPrice = Fmt.parseMoney(cost),
                suggestedPrice = Fmt.parseMoney(price),
                purchaseDate = purchase,
                expirationDate = expiration,
                notes = notes.trim(),
            )
            if (isNew && withProfiles) {
                val each = Fmt.parseMoney(profilePrice)
                vm.repo.createAccount(item.copy(profilePin = ""), profileNames.map { it.trim() to each })
            } else {
                vm.repo.saveItem(item, copies = if (isNew) (copies.toIntOrNull() ?: 1).coerceIn(1, 50) else 1)
            }
            nav.back()
        }
    }

    ScreenScaffold(
        title = if (isNew) "Nuevo producto" else "Editar producto",
        onBack = { nav.back() },
        actions = { IconButton(onClick = ::save) { Icon(Icons.Filled.Check, contentDescription = "Guardar") } },
    ) { padding ->
        if (!loaded) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ScreenScaffold
        }
        val cat = Category.of(category)
        Column(
            Modifier
                .fillMaxSize()
                .padding(top = padding.calculateTopPadding())
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ExposedDropdownMenuBox(expanded = categoryMenu, onExpandedChange = { categoryMenu = it }) {
                OutlinedTextField(
                    value = cat.label,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Categoría") },
                    leadingIcon = { Box(Modifier.padding(start = 8.dp)) { CategoryAvatar(cat, 32) } },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = categoryMenu) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                )
                ExposedDropdownMenu(expanded = categoryMenu, onDismissRequest = { categoryMenu = false }) {
                    Category.entries.forEach { c ->
                        DropdownMenuItem(
                            text = { Text(c.label) },
                            leadingIcon = { CategoryAvatar(c, 28) },
                            onClick = { category = c.name; categoryMenu = false },
                        )
                    }
                }
            }

            SimpleField("Nombre del servicio / producto *", name, { name = it; nameError = false }, supporting = if (nameError) "Escribe el nombre" else null)
            if (cat.suggestions.isNotEmpty()) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    cat.suggestions.forEach { sug ->
                        SuggestionChip(onClick = { name = sug; nameError = false }, label = { Text(sug) })
                    }
                }
            }
            SimpleField("Plan / tipo (ej. Premium 4K, Perfil, Mensual)", plan, { plan = it })

            if (isNew) {
                SectionTitle("¿Cómo la vas a vender?")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = !withProfiles,
                        onClick = { withProfiles = false },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                    ) { Text("Producto individual") }
                    SegmentedButton(
                        selected = withProfiles,
                        onClick = { withProfiles = true },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                    ) { Text("Cuenta con perfiles") }
                }
                if (withProfiles) {
                    Text(
                        "Se guarda la cuenta completa y sus perfiles. Al vender eliges si vendes la cuenta completa o un solo perfil.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else if (kind == ItemKind.ACCOUNT) {
                Text(
                    "Cuenta con perfiles: los cambios de correo, clave, link, proveedor y fechas se aplican también a todos sus perfiles.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
            } else if (kind == ItemKind.PROFILE) {
                Text(
                    "Este es un perfil de una cuenta completa. El correo, la clave y las fechas se actualizan al editar la cuenta.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
            }

            SectionTitle("Datos de acceso")
            SimpleField("Usuario / correo", user, { user = it }, keyboardType = KeyboardType.Email, leading = Icons.Filled.Email)
            SimpleField("Contraseña", password, { password = it }, password = true, leading = Icons.Filled.Key)
            if (!(isNew && withProfiles) && kind != ItemKind.ACCOUNT) {
                SimpleField("Perfil / PIN", profile, { profile = it }, leading = Icons.Filled.Person)
            }
            SimpleField("Link de acceso (plataforma, curso, sistema)", url, { url = it }, keyboardType = KeyboardType.Uri, leading = Icons.Filled.Link)
            SimpleField("Información adicional (licencia, servidor, etc.)", extra, { extra = it }, singleLine = false, minLines = 2)

            SectionTitle("Compra")
            SimpleField("Proveedor", supplier, { supplier = it }, leading = Icons.Filled.Store)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SimpleField("Costo (${s.currencySymbol})", cost, { cost = it }, Modifier.weight(1f), keyboardType = KeyboardType.Decimal)
                SimpleField(
                    if ((isNew && withProfiles) || kind == ItemKind.ACCOUNT) "Precio cuenta completa" else "Precio venta (${s.currencySymbol})",
                    price,
                    { price = it },
                    Modifier.weight(1f),
                    keyboardType = KeyboardType.Decimal,
                )
            }
            if (isNew && withProfiles) {
                Text(
                    "El costo es el de la cuenta completa; se reparte entre los perfiles para calcular la ganancia.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            DateField("Fecha de compra", purchase, { purchase = it })
            DateField("Fecha de vencimiento de la cuenta", expiration, { expiration = it })
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(1L to "1 mes", 2L to "2 meses", 3L to "3 meses", 6L to "6 meses", 12L to "1 año").forEach { (m, label) ->
                    AssistChip(
                        onClick = { expiration = LocalDate.ofEpochDay(purchase ?: today()).plusMonths(m).toEpochDay() },
                        label = { Text("+$label") },
                    )
                }
                AssistChip(onClick = { expiration = null }, label = { Text("Sin vencimiento") })
            }

            SimpleField("Notas", notes, { notes = it }, singleLine = false, minLines = 2)

            if (isNew && withProfiles) {
                SectionTitle("Perfiles")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    SimpleField(
                        "Cantidad de perfiles",
                        profileNames.size.toString(),
                        { v ->
                            val n = (v.filter { it.isDigit() }.take(2).toIntOrNull() ?: 0).coerceIn(1, 20)
                            profileNames = List(n) { i -> profileNames.getOrNull(i) ?: "Perfil ${i + 1}" }
                        },
                        Modifier.weight(1f),
                        keyboardType = KeyboardType.Number,
                    )
                    SimpleField(
                        "Precio por perfil (${s.currencySymbol})",
                        profilePrice,
                        { profilePrice = it },
                        Modifier.weight(1f),
                        keyboardType = KeyboardType.Decimal,
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(2, 3, 4, 5, 6).forEach { n ->
                        AssistChip(
                            onClick = { profileNames = List(n) { i -> profileNames.getOrNull(i) ?: "Perfil ${i + 1}" } },
                            label = { Text("$n perfiles") },
                        )
                    }
                }
                profileNames.forEachIndexed { i, label ->
                    SimpleField(
                        "Perfil ${i + 1}: nombre / PIN",
                        label,
                        { v -> profileNames = profileNames.toMutableList().also { it[i] = v } },
                        leading = Icons.Filled.Person,
                    )
                }
            } else if (isNew) {
                SectionTitle("Cantidad")
                SimpleField(
                    "Unidades a crear",
                    copies,
                    { v -> copies = v.filter { it.isDigit() }.take(2) },
                    keyboardType = KeyboardType.Number,
                    supporting = "Para crear varias unidades iguales (ej. códigos o licencias). Para perfiles usa «Cuenta con perfiles».",
                )
            }
            SpacerH(4)
            Button(onClick = ::save, modifier = Modifier.fillMaxWidth()) { Text(if (isNew) "Guardar producto" else "Guardar cambios") }
            SpacerH(24)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 8.dp),
    )
}
