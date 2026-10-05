package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.DeleteForever
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.player.VlcRuntime
import com.webpro.player.desktop.ui.LocalContainer
import com.webpro.player.desktop.ui.LocalNavigator
import com.webpro.player.desktop.ui.S
import com.webpro.player.desktop.ui.Screen
import com.webpro.player.desktop.ui.components.Dimens
import com.webpro.player.desktop.ui.rememberScreenModel
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import com.webpro.player.ui.components.ScreenHeader
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

@Composable
fun SettingsScreen() {
    val container = LocalContainer.current
    val navigator = LocalNavigator.current
    val model = rememberScreenModel { SettingsModel(container) { navigator.replaceAll(Screen.Login) } }
    val session by model.session.collectAsState()
    val settings by model.settings.collectAsState()
    var confirmLogout by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Dimens.ScreenPadding)) {
        ScreenHeader(S.SETTINGS)
        Spacer(Modifier.height(16.dp))

        Card(S.ACCOUNT) {
            val credentials = session?.credentials
            val account = session?.account
            Info(S.SERVER, credentials?.serverUrl ?: "—")
            Info(S.LOGIN_USER, credentials?.username ?: "—")
            Info(S.LOGIN_PASSWORD, if (credentials != null) "••••••••" else "—")
            Info(S.STATUS, account?.status ?: S.UNKNOWN)
            Info(S.EXPIRATION, account?.expirationEpochSeconds?.let { TimeFormat.date(it) } ?: S.UNLIMITED)
            if (account?.maxConnections != null) Info(S.CONNECTIONS, "${account.activeConnections ?: 0} / ${account.maxConnections}")
            Info(S.REMEMBERED, if (session?.remember == true) S.YES else S.NO)
        }

        Card(S.PLAYBACK) {
            Text(S.LIVE_FORMAT, style = MaterialTheme.typography.titleSmall)
            Text(S.LIVE_FORMAT_HELP, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LiveStreamFormat.entries.forEach { f ->
                    FilterChip(
                        selected = settings.liveStreamFormat == f,
                        onClick = { model.setLiveFormat(f) },
                        label = { Text(when (f) { LiveStreamFormat.AUTO -> S.FORMAT_AUTO; LiveStreamFormat.HLS -> S.FORMAT_HLS; LiveStreamFormat.TS -> S.FORMAT_TS }) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = WebProColors.Primary, selectedLabelColor = WebProColors.TextPrimary)
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(S.CONNECTION, style = MaterialTheme.typography.titleSmall)
            Text(S.CONNECTION_HELP, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ConnectionMode.entries.forEach { mode ->
                    FilterChip(
                        selected = settings.connectionMode == mode,
                        onClick = { model.setConnectionMode(mode) },
                        label = {
                            Text(
                                when (mode) {
                                    ConnectionMode.AUTO -> S.CONNECTION_AUTO
                                    ConnectionMode.FAST -> S.CONNECTION_FAST
                                    ConnectionMode.SLOW -> S.CONNECTION_SLOW
                                    ConnectionMode.VERY_SLOW -> S.CONNECTION_VERY_SLOW
                                }
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = WebProColors.Primary, selectedLabelColor = WebProColors.TextPrimary)
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(S.QUALITY, style = MaterialTheme.typography.titleSmall)
            Text(S.QUALITY_HELP, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MaxQuality.entries.forEach { quality ->
                    FilterChip(
                        selected = settings.maxQuality == quality,
                        onClick = { model.setMaxQuality(quality) },
                        label = { Text(quality.maxHeight?.let { "${it}p" } ?: S.QUALITY_AUTO) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = WebProColors.Primary, selectedLabelColor = WebProColors.TextPrimary)
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = WebProColors.Outline)
            ToggleRow(S.HW_DECODING, S.HW_DECODING_HELP, settings.hardwareDecoding, model::setHardware)
            HorizontalDivider(color = WebProColors.Outline)
            ToggleRow(S.AUTOPLAY, S.AUTOPLAY_HELP, settings.autoPlayNextEpisode, model::setAutoplay)
        }

        Card(S.DATA) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = { confirmLogout = true }) {
                    Icon(Icons.AutoMirrored.Rounded.Logout, null); Spacer(Modifier.width(8.dp)); Text(S.LOGOUT)
                }
                Button(onClick = { confirmDelete = true }, colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Error)) {
                    Icon(Icons.Rounded.DeleteForever, null); Spacer(Modifier.width(8.dp)); Text(S.DELETE_ALL)
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(S.DATA_HELP, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
        }

        Card(S.ABOUT) {
            Info(S.VERSION, System.getProperty("jpackage.app-version") ?: "1.0.0")
            Info(S.ENGINE, if (VlcRuntime.initialize()) "libVLC 3 (VLC)" else "—")
            Spacer(Modifier.height(8.dp))
            Text(S.ABOUT_TEXT, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text(S.LOGOUT) },
            text = { Text(S.LOGOUT_CONFIRM) },
            confirmButton = { Button(onClick = { confirmLogout = false; model.logout() }) { Text(S.LOGOUT) } },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text(S.CANCEL) } }
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(S.DELETE_ALL) },
            text = { Text(S.DELETE_CONFIRM) },
            confirmButton = {
                Button(onClick = { confirmDelete = false; model.deleteAll() }, colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Error)) {
                    Text(S.DELETE)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(S.CANCEL) } }
        )
    }
}

@Composable
private fun Card(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, color = WebProColors.Surface, modifier = Modifier.widthIn(max = 900.dp).fillMaxWidth().padding(bottom = 16.dp)) {
        Column(Modifier.padding(22.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = WebProColors.Accent)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun Info(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextSecondary, modifier = Modifier.width(200.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun ToggleRow(title: String, help: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(help, style = MaterialTheme.typography.bodySmall, color = WebProColors.TextSecondary)
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
