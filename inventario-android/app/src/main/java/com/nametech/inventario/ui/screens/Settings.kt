package com.nametech.inventario.ui.screens

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.FileUpload
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nametech.inventario.BuildConfig
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Templates
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.Nav
import com.nametech.inventario.ui.components.ConfirmDialog
import com.nametech.inventario.ui.components.ScreenScaffold
import com.nametech.inventario.ui.components.SectionCard
import com.nametech.inventario.ui.components.SimpleField
import com.nametech.inventario.ui.components.SpacerH
import com.nametech.inventario.ui.components.SpacerW
import java.time.LocalDate

@Composable
fun SettingsScreen(vm: AppViewModel, nav: Nav) {
    val s by vm.settings.collectAsState()
    val context = LocalContext.current
    val toast: (String) -> Unit = { Toast.makeText(context, it, Toast.LENGTH_LONG).show() }
    var confirmRestore by remember { mutableStateOf(false) }
    var pinDialog by remember { mutableStateOf(false) }
    var passwordDialog by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    val stamp = LocalDate.now().toString()

    val backupLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri?.let { vm.backupTo(it, toast) }
    }
    val restoreLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { vm.restoreFrom(it, toast) }
    }
    val itemsCsvLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        uri?.let { vm.exportItemsCsv(it, toast) }
    }
    val salesCsvLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        uri?.let { vm.exportSalesCsv(it, toast) }
    }

    fun update(transform: (AppSettings) -> AppSettings) = vm.updateSettings(transform = transform)

    ScreenScaffold(title = "Ajustes") { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(top = padding.calculateTopPadding())
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard("Mi cuenta") {
                AccountCardContent(vm, nav, onChangePassword = { passwordDialog = true }, onLogout = { confirmLogout = true })
            }

            SectionCard("Apariencia") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("SYSTEM" to "Automático", "LIGHT" to "Claro", "DARK" to "Oscuro").forEach { (k, label) ->
                        FilterChip(selected = s.themeMode == k, onClick = { update { it.copy(themeMode = k) } }, label = { Text(label) })
                    }
                }
            }

            SectionCard(if (s.isCloud) "Mi negocio (marca)" else "Negocio") {
                if (s.isCloud) {
                    Text(
                        "Su marca, moneda y plantillas se guardan en su cuenta y se usan en todos sus dispositivos.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    SpacerH(8)
                }
                SimpleField("Nombre del negocio", s.businessName, { v -> update { it.copy(businessName = v) } })
                SpacerH(8)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SimpleField("Moneda", s.currencySymbol, { v -> update { it.copy(currencySymbol = v.take(4)) } }, Modifier.weight(1f))
                    SimpleField(
                        "Indicativo país",
                        s.countryCode,
                        { v -> update { it.copy(countryCode = v.filter(Char::isDigit).take(4)) } },
                        Modifier.weight(1f),
                        keyboardType = KeyboardType.Number,
                    )
                }
                SpacerH(8)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Decimales en precios", modifier = Modifier.weight(1f))
                    FilterChip(selected = s.currencyDecimals == 0, onClick = { update { it.copy(currencyDecimals = 0) } }, label = { Text("0") })
                    SpacerW(8)
                    FilterChip(selected = s.currencyDecimals == 2, onClick = { update { it.copy(currencyDecimals = 2) } }, label = { Text("2") })
                }
            }

            SectionCard("Vencimientos") {
                Text("Marcar «por vencer» cuando falten ${s.dueSoonDays} día(s) o menos")
                Slider(
                    value = s.dueSoonDays.toFloat(),
                    onValueChange = { v -> update { it.copy(dueSoonDays = v.toInt()) } },
                    valueRange = 1f..15f,
                    steps = 13,
                )
                Text("Duración por defecto al vender: ${s.defaultSaleMonths} mes(es)")
                Slider(
                    value = s.defaultSaleMonths.toFloat(),
                    onValueChange = { v -> update { it.copy(defaultSaleMonths = v.toInt()) } },
                    valueRange = 1f..12f,
                    steps = 10,
                )
            }

            SectionCard("Notificaciones") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Aviso diario de vencimientos", modifier = Modifier.weight(1f))
                    Switch(
                        checked = s.notificationsEnabled,
                        onCheckedChange = { v -> vm.updateSettings(rescheduleNotifications = true) { it.copy(notificationsEnabled = v) } },
                    )
                }
                if (s.notificationsEnabled) {
                    Text("Hora del aviso: ${"%02d".format(s.notifyHour)}:00")
                    Slider(
                        value = s.notifyHour.toFloat(),
                        onValueChange = { v -> update { it.copy(notifyHour = v.toInt()) } },
                        onValueChangeFinished = { vm.updateSettings(rescheduleNotifications = true) { it } },
                        valueRange = 0f..23f,
                        steps = 22,
                    )
                }
                OutlinedButton(onClick = { vm.testNotification(); toast("Revisando vencimientos…") }) {
                    Icon(Icons.Filled.NotificationsActive, null); SpacerW(6); Text("Revisar ahora")
                }
            }

            SectionCard("WhatsApp") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Usar WhatsApp Business")
                        Text("Si no está instalado se usa WhatsApp normal", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(checked = s.useWhatsAppBusiness, onCheckedChange = { v -> update { it.copy(useWhatsAppBusiness = v) } })
                }
            }

            SectionCard("Plantillas de mensajes") {
                Text(Templates.HELP, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                SpacerH(8)
                SimpleField("Envío de datos de acceso", s.templateCredentials, { v -> update { it.copy(templateCredentials = v) } }, singleLine = false, minLines = 4)
                SpacerH(8)
                SimpleField("Recordatorio (por vencer)", s.templateReminder, { v -> update { it.copy(templateReminder = v) } }, singleLine = false, minLines = 4)
                SpacerH(8)
                SimpleField("Servicio vencido", s.templateExpired, { v -> update { it.copy(templateExpired = v) } }, singleLine = false, minLines = 4)
                SpacerH(8)
                SimpleField("Cobro pendiente", s.templatePayment, { v -> update { it.copy(templatePayment = v) } }, singleLine = false, minLines = 3)
                TextButton(onClick = {
                    update {
                        it.copy(
                            templateCredentials = Templates.DEFAULT_CREDENTIALS,
                            templateReminder = Templates.DEFAULT_REMINDER,
                            templateExpired = Templates.DEFAULT_EXPIRED,
                            templatePayment = Templates.DEFAULT_PAYMENT,
                        )
                    }
                }) { Text("Restaurar plantillas originales") }
            }

            SectionCard("Seguridad") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Bloqueo con PIN")
                        Text(
                            if (s.pinHash.isEmpty()) "Desactivado" else "Activado: se pide al abrir la app",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (s.pinHash.isEmpty()) {
                        Button(onClick = { pinDialog = true }) { Text("Activar") }
                    } else {
                        OutlinedButton(onClick = { vm.setPin(null) }) { Text("Quitar") }
                    }
                }
            }

            SectionCard("Datos y respaldos") {
                Text(
                    "Guarda un respaldo en Drive, en tu correo o en el teléfono. Al restaurar se reemplazan todos los datos actuales.",
                    style = MaterialTheme.typography.bodySmall,
                )
                SpacerH(8)
                Button(onClick = { backupLauncher.launch("inventario-respaldo-$stamp.json") }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.FileDownload, null); SpacerW(6); Text("Crear respaldo")
                }
                if (!s.isCloud) {
                    OutlinedButton(onClick = { confirmRestore = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.FileUpload, null); SpacerW(6); Text("Restaurar respaldo")
                    }
                }
                OutlinedButton(onClick = { itemsCsvLauncher.launch("inventario-$stamp.csv") }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.TableChart, null); SpacerW(6); Text("Exportar inventario (Excel/CSV)")
                }
                OutlinedButton(onClick = { salesCsvLauncher.launch("ventas-$stamp.csv") }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.TableChart, null); SpacerW(6); Text("Exportar ventas (Excel/CSV)")
                }
            }

            SectionCard("Actualizaciones") {
                Text("Versión instalada: ${BuildConfig.VERSION_NAME}")
                Text(
                    "Cuando se publique una versión nueva le aparecerá un aviso para instalarla sin perder sus datos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SpacerH(8)
                OutlinedButton(onClick = { vm.checkForUpdate(manual = true) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.SystemUpdate, null); SpacerW(6); Text("Buscar actualizaciones")
                }
            }

            Text(
                "Inventario Pro v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center,
            )
            SpacerH(16)
        }
    }

    if (confirmRestore) {
        ConfirmDialog(
            "Restaurar respaldo",
            "Todos los datos actuales se reemplazarán por los del archivo. ¿Continuar?",
            confirm = "Elegir archivo",
            onConfirm = { restoreLauncher.launch(arrayOf("application/json", "application/octet-stream", "*/*")) },
            onDismiss = { confirmRestore = false },
        )
    }
    if (passwordDialog) ChangePasswordDialog(vm) { passwordDialog = false }
    if (confirmLogout) {
        ConfirmDialog(
            "Cerrar sesión",
            "Sus datos siguen guardados en su cuenta. Al volver a entrar se descargan de nuevo. ¿Cerrar sesión?",
            confirm = "Cerrar sesión",
            onConfirm = { vm.logout() },
            onDismiss = { confirmLogout = false },
        )
    }
    if (pinDialog) {
        PinSetupDialog(onDismiss = { pinDialog = false }) { pin ->
            vm.setPin(pin)
            pinDialog = false
            toast("PIN activado")
        }
    }
}

@Composable
private fun PinSetupDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var pin by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    val valid = pin.length >= 4 && pin == repeat
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Crear PIN") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PinInput("PIN (4 a 8 números)", pin) { pin = it }
                PinInput("Repetir PIN", repeat) { repeat = it }
                if (repeat.isNotEmpty() && pin != repeat) Text("Los PIN no coinciden", color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(pin) }, enabled = valid) { Text("Guardar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun PinInput(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> onChange(v.filter(Char::isDigit).take(8)) },
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
fun LockScreen(vm: AppViewModel) {
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Filled.Lock, null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
        SpacerH(16)
        Text("Inventario Pro", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Ingresa tu PIN para continuar", color = MaterialTheme.colorScheme.onSurfaceVariant)
        SpacerH(24)
        PinInput("PIN", pin) { pin = it; error = false }
        if (error) Text("PIN incorrecto", color = MaterialTheme.colorScheme.error)
        SpacerH(16)
        Button(onClick = { error = !vm.unlock(pin); if (error) pin = "" }, modifier = Modifier.fillMaxWidth(), enabled = pin.length >= 4) {
            Text("Desbloquear")
        }
    }
}
