package com.nametech.recupera

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nametech.recupera.data.Message
import com.nametech.recupera.service.NotificationListener
import com.nametech.recupera.ui.MessagesViewModel
import com.nametech.recupera.ui.theme.RecuperaTheme
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RecuperaTheme {
                AppScreen()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppScreen(vm: MessagesViewModel = viewModel()) {
    val context = LocalContext.current

    // Vuelve a comprobar el permiso cada vez que la pantalla pasa a primer plano.
    var hasAccess by remember { mutableStateOf(isListenerEnabled(context)) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) hasAccess = isListenerEnabled(context)
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var tab by remember { mutableIntStateOf(0) }
    val all by vm.allMessages.collectAsState()
    val deleted by vm.deletedMessages.collectAsState()
    val total by vm.count.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Recupera Mensajes") },
                actions = {
                    IconButton(onClick = { vm.clearAll() }) {
                        Icon(Icons.Filled.DeleteSweep, contentDescription = "Borrar todo")
                    }
                }
            )
        }
    ) { inner ->
        Column(Modifier.fillMaxSize().padding(inner)) {

            if (!hasAccess) {
                PermissionCard(onOpen = { openListenerSettings(context) })
            } else {
                InfoBanner(total)
            }

            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Todos") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Eliminados") })
            }

            val list = if (tab == 0) all else deleted
            if (list.isEmpty()) {
                EmptyState(hasAccess, tab)
            } else {
                MessageList(list)
            }
        }
    }
}

@Composable
private fun PermissionCard(onOpen: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Falta el permiso de notificaciones",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Spacer(Modifier.padding(4.dp))
            Text(
                "Para guardar los mensajes, activa el acceso a las notificaciones " +
                    "de esta app. Solo se leen las notificaciones de WhatsApp en " +
                    "este teléfono; nada sale de él.",
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Spacer(Modifier.padding(6.dp))
            Button(onClick = onOpen) { Text("Dar permiso") }
        }
    }
}

@Composable
private fun InfoBanner(total: Int) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Capturando mensajes",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Text(
                "$total mensajes guardados. Solo se capturan los que llegan " +
                    "como notificación después de activar la app.",
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

@Composable
private fun EmptyState(hasAccess: Boolean, tab: Int) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            if (!hasAccess) "Da el permiso para empezar a guardar mensajes."
            else if (tab == 1) "Aún no se ha detectado ningún mensaje eliminado."
            else "Todavía no hay mensajes. Llegarán aquí a medida que recibas notificaciones de WhatsApp.",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

@Composable
private fun MessageList(list: List<Message>) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        items(list, key = { it.id }) { m -> MessageRow(m) }
    }
}

@Composable
private fun MessageRow(m: Message) {
    val fmt = remember { SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()) }
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        colors = if (m.isDeletedMarker)
            CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        else CardDefaults.cardColors()
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(m.chatKey, fontWeight = FontWeight.Bold)
                Text(fmt.format(Date(m.timestamp)), style = MaterialTheme.typography.labelSmall)
            }
            if (m.sender.isNotEmpty() && m.sender != m.chatKey) {
                Text(m.sender, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.padding(2.dp))
            Text(
                if (m.isDeletedMarker) "🗑 ${m.content}" else m.content,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}

/** Comprueba si el servicio de escucha de notificaciones está habilitado. */
private fun isListenerEnabled(context: Context): Boolean {
    val flat = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
    ) ?: return false
    val expected = ComponentName(context, NotificationListener::class.java)
    return flat.split(":").any {
        ComponentName.unflattenFromString(it) == expected
    }
}

private fun openListenerSettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
}
