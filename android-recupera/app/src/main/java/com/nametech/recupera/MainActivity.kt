package com.nametech.recupera

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.nametech.recupera.data.MediaItem
import com.nametech.recupera.data.MediaType
import com.nametech.recupera.data.Message
import com.nametech.recupera.service.MediaBackupService
import com.nametech.recupera.service.NotificationListener
import com.nametech.recupera.ui.MessagesViewModel
import com.nametech.recupera.ui.theme.RecuperaTheme
import java.io.File
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

    var hasNotifAccess by remember { mutableStateOf(isListenerEnabled(context)) }
    var hasFilesAccess by remember { mutableStateOf(hasAllFilesAccess(context)) }

    // Pide el permiso de notificaciones (Android 13+) para el aviso del servicio.
    val notifPermLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (hasFilesAccess) MediaBackupService.start(context)
    }

    // Recompone permisos al volver a primer plano y arranca el servicio si procede.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasNotifAccess = isListenerEnabled(context)
                hasFilesAccess = hasAllFilesAccess(context)
                if (hasFilesAccess) MediaBackupService.start(context)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    var tab by remember { mutableIntStateOf(0) }
    val all by vm.allMessages.collectAsState()
    val deleted by vm.deletedMessages.collectAsState()
    val total by vm.count.collectAsState()
    val media by vm.media.collectAsState()
    val mediaTotal by vm.mediaCount.collectAsState()

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

            if (!hasNotifAccess) {
                PermissionCard(
                    title = "Falta el permiso de notificaciones",
                    body = "Para guardar los mensajes de texto, activa el acceso a las " +
                        "notificaciones de esta app. Solo se leen las de WhatsApp en este teléfono.",
                    button = "Activar notificaciones",
                    onOpen = { openListenerSettings(context) }
                )
            }
            if (!hasFilesAccess) {
                PermissionCard(
                    title = "Falta el acceso a archivos",
                    body = "Para rescatar fotos, audios y vídeos antes de que WhatsApp los " +
                        "borre, activa \"Acceso a todos los archivos\" para esta app.",
                    button = "Activar acceso a archivos",
                    onOpen = { openAllFilesSettings(context) }
                )
            }
            if (hasNotifAccess && hasFilesAccess) {
                InfoBanner(total, mediaTotal)
            }

            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 0.dp) {
                Tab(tab == 0, onClick = { tab = 0 }, text = { Text("Todos") })
                Tab(tab == 1, onClick = { tab = 1 }, text = { Text("Eliminados") })
                Tab(tab == 2, onClick = { tab = 2 }, text = { Text("Multimedia") })
            }

            when (tab) {
                2 -> MediaTab(media, hasFilesAccess)
                else -> {
                    val list = if (tab == 0) all else deleted
                    if (list.isEmpty()) EmptyMessages(hasNotifAccess, tab) else MessageList(list)
                }
            }
        }
    }
}

@Composable
private fun PermissionCard(title: String, body: String, button: String, onOpen: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.padding(4.dp))
            Text(body, color = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.padding(6.dp))
            Button(onClick = onOpen) { Text(button) }
        }
    }
}

@Composable
private fun InfoBanner(total: Int, mediaTotal: Int) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Protección activa",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Text(
                "$total mensajes y $mediaTotal archivos guardados. Se captura lo que " +
                    "llega después de activar la app.",
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

@Composable
private fun EmptyMessages(hasAccess: Boolean, tab: Int) {
    Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(
            if (!hasAccess) "Da el permiso para empezar a guardar mensajes."
            else if (tab == 1) "Aún no se ha detectado ningún mensaje eliminado."
            else "Todavía no hay mensajes. Llegarán según recibas notificaciones de WhatsApp.",
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
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
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

@Composable
private fun MediaTab(media: List<MediaItem>, hasFilesAccess: Boolean) {
    if (media.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Text(
                if (!hasFilesAccess)
                    "Activa el acceso a archivos para empezar a rescatar fotos, audios y vídeos."
                else
                    "Aún no hay multimedia guardada. Se copiará automáticamente a medida que " +
                        "recibas y descargues archivos en WhatsApp.",
                style = MaterialTheme.typography.bodyLarge
            )
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(110.dp),
        modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp)
    ) {
        gridItems(media, key = { it.id }) { item -> MediaCell(item) }
    }
}

@Composable
private fun MediaCell(item: MediaItem) {
    Card(Modifier.padding(4.dp).aspectRatio(1f)) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when (item.type) {
                MediaType.IMAGE -> AsyncImage(
                    model = File(item.savedPath),
                    contentDescription = item.fileName,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
                else -> Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(6.dp)
                ) {
                    Icon(
                        imageVector = when (item.type) {
                            MediaType.VIDEO -> Icons.Filled.PlayCircle
                            MediaType.AUDIO -> Icons.Filled.AudioFile
                            MediaType.DOCUMENT -> Icons.Filled.Description
                            else -> Icons.Filled.InsertDriveFile
                        },
                        contentDescription = item.fileName,
                        modifier = Modifier.padding(bottom = 4.dp)
                    )
                    Text(
                        item.fileName,
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

/* ---------- permisos ---------- */

private fun isListenerEnabled(context: Context): Boolean {
    val flat = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
    ) ?: return false
    val expected = ComponentName(context, NotificationListener::class.java)
    return flat.split(":").any { ComponentName.unflattenFromString(it) == expected }
}

private fun openListenerSettings(context: Context) {
    context.startActivity(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
}

private fun hasAllFilesAccess(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
    else context.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED

private fun openAllFilesSettings(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
            .setData(Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(intent) }.onFailure {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    } else {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
