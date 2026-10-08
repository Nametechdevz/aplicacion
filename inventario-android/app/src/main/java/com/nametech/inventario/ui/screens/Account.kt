package com.nametech.inventario.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nametech.inventario.BuildConfig
import com.nametech.inventario.data.ActivityEntry
import com.nametech.inventario.data.AppRelease
import com.nametech.inventario.data.CloudUser
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.PendingLogin
import com.nametech.inventario.ui.components.DAY_MS
import com.nametech.inventario.ui.components.DateField
import com.nametech.inventario.ui.components.EmptyState
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SimpleField
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import com.nametech.inventario.ui.theme.Amber
import com.nametech.inventario.ui.theme.Green
import com.nametech.inventario.ui.theme.Purple
import com.nametech.inventario.ui.theme.Red
import com.nametech.inventario.ui.theme.Teal
import com.nametech.inventario.util.Fmt
import kotlinx.coroutines.launch

private val heroBrush = Brush.linearGradient(listOf(Purple, Teal))

@Composable
private fun Hero(title: String, subtitle: String) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(heroBrush)
            .statusBarsPadding()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(72.dp)
                .background(Color.White.copy(alpha = 0.2f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Inventory2, null, tint = Color.White, modifier = Modifier.size(40.dp)) }
        SpacerH(12)
        Text(title, color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(subtitle, color = Color.White.copy(alpha = 0.85f), textAlign = TextAlign.Center)
    }
}

/** Primera vez: elegir trabajar solo en el teléfono o con la cuenta del servidor. */
@Composable
fun WelcomeScreen(vm: AppViewModel) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
    ) {
        Hero("Inventario Pro", "Cuentas streaming, cursos, sistemas y apps\ncon ventas, clientes y recordatorios")
        Column(Modifier.padding(20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("¿Cómo quiere usar la app?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            ChoiceCard(
                Icons.Filled.Cloud,
                "Con mi cuenta (recomendado)",
                "Inicie sesión con el usuario que le dio su proveedor. Su inventario queda guardado en la nube y lo puede abrir desde varios dispositivos.",
            ) { vm.wantCloudMode() }
            ChoiceCard(
                Icons.Filled.PhoneAndroid,
                "Solo en este teléfono",
                "Sin usuario ni internet. Los datos quedan únicamente en este celular (puede conectarse más adelante desde Ajustes).",
            ) { vm.chooseLocalMode() }
        }
    }
}

@Composable
private fun ChoiceCard(icon: ImageVector, title: String, text: String, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(48.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }
            SpacerW(14)
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Inicio de sesión con la cuenta del servidor. */
@Composable
fun LoginScreen(vm: AppViewModel) {
    val s by vm.settings.collectAsState()
    val scope = rememberCoroutineScope()
    var server by rememberSaveable { mutableStateOf(s.serverUrl) }
    var user by rememberSaveable { mutableStateOf(s.username) }
    var pass by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<PendingLogin?>(null) }

    fun submit() {
        if (busy || server.isBlank() || user.isBlank() || pass.isBlank()) return
        busy = true
        scope.launch {
            val p = vm.login(server, user, pass)
            if (p != null) {
                if (p.localItems > 0) pending = p else vm.finishLogin(p, uploadLocal = false)
            }
            busy = false
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .verticalScroll(rememberScrollState()),
    ) {
        Hero("Iniciar sesión", if (s.userName.isNotBlank()) "Hola de nuevo, ${s.userName}" else "Entre con su usuario para ver su inventario")
        Column(Modifier.padding(20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SimpleField(
                "Dirección del servidor",
                server,
                { server = it },
                keyboardType = KeyboardType.Uri,
                leading = Icons.Filled.Language,
                supporting = "Ej. midominio.com/inventario (se la da su proveedor)",
            )
            if (server.trim().startsWith("http://")) {
                Text(
                    "⚠️ Sin https la contraseña viaja sin cifrar. Active SSL en su hosting.",
                    color = Amber,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            SimpleField("Usuario", user, { user = it }, leading = Icons.Filled.Person)
            OutlinedTextField(
                value = pass,
                onValueChange = { pass = it },
                label = { Text("Contraseña") },
                leadingIcon = { Icon(Icons.Filled.Lock, null) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = ::submit,
                enabled = !busy && server.isNotBlank() && user.isNotBlank() && pass.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White) else Text("Entrar")
            }
            TextButton(onClick = { vm.cancelCloudMode() }, modifier = Modifier.fillMaxWidth()) {
                Text("Usar solo en este teléfono, sin cuenta")
            }
        }
    }

    pending?.let { p ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Datos de este teléfono") },
            text = {
                Text(
                    if (!p.serverHasData) {
                        "Este teléfono tiene ${p.localItems} producto(s) guardados. ¿Quiere subirlos a su cuenta para verlos en todos sus dispositivos?"
                    } else {
                        "Su cuenta ya tiene un inventario en el servidor y se usará ese. Los ${p.localItems} producto(s) de este teléfono se guardan en un respaldo interno por seguridad."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    pending = null
                    busy = true
                    scope.launch {
                        vm.finishLogin(p, uploadLocal = !p.serverHasData)
                        busy = false
                    }
                }) { Text(if (!p.serverHasData) "Subir mis datos" else "Continuar") }
            },
            dismissButton = {
                if (!p.serverHasData) {
                    TextButton(onClick = {
                        pending = null
                        busy = true
                        scope.launch {
                            vm.finishLogin(p, uploadLocal = false)
                            busy = false
                        }
                    }) { Text("Empezar vacío") }
                }
            },
        )
    }
}

/** Aviso de nueva versión (se instala encima sin perder datos). */
@Composable
fun UpdateDialog(vm: AppViewModel, release: AppRelease) {
    val progress = vm.downloadProgress
    AlertDialog(
        onDismissRequest = { if (progress == null) vm.updateDismissed = true },
        icon = { Icon(Icons.Filled.SystemUpdate, null, tint = MaterialTheme.colorScheme.primary) },
        title = { Text("Nueva versión ${release.versionName}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text("Tiene la versión ${BuildConfig.VERSION_NAME}. La actualización se instala encima y no se pierde ningún dato.")
                if (release.notes.isNotBlank()) {
                    SpacerH(10)
                    Text("Novedades", fontWeight = FontWeight.Bold)
                    Text(release.notes, style = MaterialTheme.typography.bodyMedium)
                }
                if (progress != null) {
                    SpacerH(12)
                    LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                    Text("Descargando… ${(progress * 100).toInt()}%", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { vm.installUpdate() }, enabled = progress == null) { Text("Actualizar") }
        },
        dismissButton = {
            TextButton(onClick = { vm.updateDismissed = true }, enabled = progress == null) { Text("Más tarde") }
        },
    )
}

@Composable
fun ChangePasswordDialog(vm: AppViewModel, onDismiss: () -> Unit) {
    var current by remember { mutableStateOf("") }
    var new by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    val valid = current.isNotEmpty() && new.length >= 6 && new == repeat
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cambiar contraseña") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SimpleField("Contraseña actual", current, { current = it }, password = true)
                SimpleField("Nueva contraseña (mín. 6)", new, { new = it }, password = true)
                SimpleField("Repetir nueva contraseña", repeat, { repeat = it }, password = true)
                if (repeat.isNotEmpty() && new != repeat) Text("No coinciden", color = MaterialTheme.colorScheme.error)
                Text(
                    "Se cerrará la sesión en sus otros dispositivos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { TextButton(onClick = { vm.changePassword(current, new, onDismiss) }, enabled = valid) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

// ---------------------------------------------------------------- administrador

/** Revendedores: cada uno con su inventario y marca propios. Solo para el administrador. */
@Composable
fun UsersScreen(vm: AppViewModel, nav: Nav) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<CloudUser>?>(null) }
    var editing by remember { mutableStateOf<CloudUser?>(null) }
    var creating by remember { mutableStateOf(false) }
    val now = System.currentTimeMillis()

    fun load() {
        scope.launch { users = vm.safe { vm.cloud.users() } ?: users.orEmpty() }
    }
    LaunchedEffect(Unit) { load() }

    ScreenScaffold(
        title = "Usuarios y revendedores",
        onBack = { nav.back() },
        actions = { IconButton(onClick = ::load) { Icon(Icons.Filled.Refresh, "Actualizar") } },
        fab = { FloatingActionButton(onClick = { creating = true }) { Icon(Icons.Filled.PersonAdd, "Nuevo usuario") } },
    ) { padding ->
        val list = users
        if (list == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@ScreenScaffold
        }
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Text(
                    "Cada usuario tiene su propio inventario, clientes y marca, y puede entrar desde varios dispositivos. Usted no ve sus datos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            items(list, key = { it.id }) { u ->
                val expired = u.expiresAt in 1 until now
                Card(
                    onClick = { editing = u },
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                ) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(if (u.isAdmin) Purple.copy(alpha = 0.18f) else Teal.copy(alpha = 0.18f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(u.name.take(1).uppercase(), fontWeight = FontWeight.Bold, color = if (u.isAdmin) Purple else Teal)
                        }
                        SpacerW(12)
                        Column(Modifier.weight(1f)) {
                            Text(u.name, fontWeight = FontWeight.Bold)
                            Text("@${u.username} · ${u.itemCount} productos", style = MaterialTheme.typography.bodySmall)
                            val status = when {
                                !u.active -> "Desactivado" to Red
                                expired -> "Acceso vencido el ${Fmt.date(Math.floorDiv(u.expiresAt, DAY_MS))}" to Red
                                u.expiresAt > 0 -> "Acceso hasta ${Fmt.date(Math.floorDiv(u.expiresAt, DAY_MS))}" to Amber
                                else -> (if (u.isAdmin) "Administrador" else "Acceso sin vencimiento") to Green
                            }
                            Text(status.first, style = MaterialTheme.typography.labelMedium, color = status.second, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    if (creating || editing != null) {
        UserDialog(
            vm = vm,
            user = editing,
            onDismiss = { creating = false; editing = null },
            onSaved = { creating = false; editing = null; load() },
        )
    }
}

@Composable
private fun UserDialog(vm: AppViewModel, user: CloudUser?, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(user?.name.orEmpty()) }
    var username by remember { mutableStateOf(user?.username.orEmpty()) }
    var phone by remember { mutableStateOf(user?.phone.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var admin by remember { mutableStateOf(user?.isAdmin == true) }
    var active by remember { mutableStateOf(user?.active ?: true) }
    var expires by remember { mutableStateOf(user?.expiresAt?.takeIf { it > 0 }?.let { Math.floorDiv(it, DAY_MS) }) }
    var busy by remember { mutableStateOf(false) }
    val isNew = user == null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (isNew) "Nuevo usuario" else "Editar usuario") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SimpleField("Nombre o marca", name, { name = it })
                SimpleField("Usuario para entrar", username, { username = it.lowercase().replace(" ", "") })
                SimpleField(
                    if (isNew) "Contraseña (mín. 6)" else "Nueva contraseña (vacío = no cambiar)",
                    password,
                    { password = it },
                    password = true,
                )
                SimpleField("WhatsApp (opcional)", phone, { phone = it }, keyboardType = KeyboardType.Phone)
                Text("Acceso", fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1L to "1 mes", 3L to "3 meses", 12L to "1 año").forEach { (m, label) ->
                        FilterChip(
                            selected = false,
                            onClick = {
                                val base = maxOf(expires ?: com.nametech.inventario.domain.today(), com.nametech.inventario.domain.today())
                                expires = java.time.LocalDate.ofEpochDay(base).plusMonths(m).toEpochDay()
                            },
                            label = { Text("+$label") },
                        )
                    }
                }
                DateField("Acceso hasta (vacío = sin vencimiento)", expires, { expires = it })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Activo", modifier = Modifier.weight(1f))
                    Switch(checked = active, onCheckedChange = { active = it })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Administrador")
                        Text("Puede crear y gestionar usuarios", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(checked = admin, onCheckedChange = { admin = it })
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && name.isNotBlank() && username.length >= 3 && (!isNew || password.length >= 6),
                onClick = {
                    busy = true
                    scope.launch {
                        // Fin del día elegido (hora local aproximada) para que el acceso dure todo ese día.
                        val expiresAt = expires?.let { (it + 1) * DAY_MS - 1 } ?: 0L
                        val saved = vm.safe {
                            vm.cloud.saveUser(
                                user?.id ?: 0, name, username, password, phone,
                                if (admin) "ADMIN" else "USER", active, expiresAt,
                            )
                        }
                        busy = false
                        if (saved != null) {
                            vm.message(if (isNew) "Usuario creado ✅" else "Usuario actualizado ✅")
                            onSaved()
                        }
                    }
                },
            ) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun ActivityScreen(vm: AppViewModel, nav: Nav) {
    val scope = rememberCoroutineScope()
    var entries by remember { mutableStateOf<List<ActivityEntry>?>(null) }
    fun load() {
        scope.launch { entries = vm.safe { vm.cloud.activity() } ?: entries.orEmpty() }
    }
    LaunchedEffect(Unit) { load() }

    ScreenScaffold(
        title = "Actividad",
        onBack = { nav.back() },
        actions = { IconButton(onClick = ::load) { Icon(Icons.Filled.Refresh, "Actualizar") } },
    ) { padding ->
        val list = entries
        when {
            list == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            list.isEmpty() -> Box(Modifier.padding(padding)) { EmptyState(Icons.Filled.History, "Sin actividad todavía") }
            else -> LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 32.dp),
            ) {
                items(list) { a ->
                    Column(Modifier.padding(vertical = 8.dp)) {
                        Text(a.action, fontWeight = FontWeight.SemiBold)
                        Text("${a.userName} · ${Fmt.dateTime(a.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

/** Estado de la cuenta para Ajustes. */
@Composable
fun AccountCardContent(vm: AppViewModel, nav: Nav, onChangePassword: () -> Unit, onLogout: () -> Unit) {
    val s by vm.settings.collectAsState()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(48.dp)
                .background(heroBrush, CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text(s.userName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold) }
        SpacerW(12)
        Column(Modifier.weight(1f)) {
            Text(s.userName, fontWeight = FontWeight.Bold)
            Text("@${s.username} · ${if (s.isAdmin) "Administrador" else "Usuario"}", style = MaterialTheme.typography.bodySmall)
            if (s.accessExpiresAt > 0 && !s.isAdmin) {
                Text(
                    "Acceso hasta ${Fmt.date(Math.floorDiv(s.accessExpiresAt, DAY_MS))}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Amber,
                )
            }
        }
    }
    SpacerH(10)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            if (vm.syncError == null) Icons.Filled.CloudDone else Icons.Filled.Cloud,
            null,
            tint = if (vm.syncError == null) Green else Red,
            modifier = Modifier.size(18.dp),
        )
        SpacerW(6)
        Text(
            when {
                vm.syncing -> "Sincronizando…"
                vm.syncError != null -> vm.syncError!!
                s.lastSyncAt > 0 -> "Sincronizado: ${Fmt.dateTime(s.lastSyncAt)}"
                else -> "Sin sincronizar"
            },
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = { vm.syncNow() }) { Text("Sincronizar") }
    }
    Text(
        "Servidor: ${s.serverUrl}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    SpacerH(8)
    if (s.isAdmin) {
        Button(onClick = { nav.users() }, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.PersonAdd, null); SpacerW(6); Text("Usuarios y revendedores")
        }
    }
    OutlinedButton(onClick = { nav.activity() }, modifier = Modifier.fillMaxWidth()) {
        Icon(Icons.Filled.History, null); SpacerW(6); Text(if (s.isAdmin) "Actividad de todos" else "Mi actividad")
    }
    OutlinedButton(onClick = onChangePassword, modifier = Modifier.fillMaxWidth()) {
        Icon(Icons.Filled.Lock, null); SpacerW(6); Text("Cambiar contraseña")
    }
    TextButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión", color = Red) }
}
