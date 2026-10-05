package com.webpro.player.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.BuildConfig
import com.webpro.player.R
import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.MaxQuality
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.components.ScreenHeader
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.utils.TimeFormat

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    onLoggedOut: () -> Unit,
    viewModel: SettingsViewModel = viewModel(factory = SettingsViewModel.Factory)
) {
    val session by viewModel.session.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val loggedOut by viewModel.loggedOut.collectAsStateWithLifecycle()
    val padding = LocalDeviceProfile.current.screenPadding
    var confirmLogout by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(loggedOut) { if (loggedOut) onLoggedOut() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = padding, vertical = padding / 2)
    ) {
        ScreenHeader(title = stringResource(R.string.section_settings))
        Spacer(Modifier.height(16.dp))

        SettingsCard(title = stringResource(R.string.settings_account)) {
            val credentials = session?.credentials
            val account = session?.account
            InfoRow(stringResource(R.string.settings_server), credentials?.serverUrl ?: "—")
            InfoRow(stringResource(R.string.settings_username), credentials?.username ?: "—")
            InfoRow(stringResource(R.string.settings_password), if (credentials != null) "••••••••" else "—")
            InfoRow(
                stringResource(R.string.settings_status),
                account?.status ?: stringResource(R.string.settings_unknown)
            )
            InfoRow(
                stringResource(R.string.settings_expiration),
                account?.expirationEpochSeconds?.let { TimeFormat.date(it) } ?: stringResource(R.string.settings_unlimited)
            )
            if (account?.maxConnections != null) {
                InfoRow(
                    stringResource(R.string.settings_connections),
                    "${account.activeConnections ?: 0} / ${account.maxConnections}"
                )
            }
            InfoRow(
                stringResource(R.string.settings_remembered),
                stringResource(if (session?.remember == true) R.string.yes else R.string.no)
            )
        }

        SettingsCard(title = stringResource(R.string.settings_playback)) {
            Text(stringResource(R.string.settings_live_format), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_live_format_help),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextSecondary
            )
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LiveStreamFormat.entries.forEach { format ->
                    FilterChip(
                        selected = settings.liveStreamFormat == format,
                        onClick = { viewModel.setLiveFormat(format) },
                        label = {
                            Text(
                                stringResource(
                                    when (format) {
                                        LiveStreamFormat.AUTO -> R.string.settings_format_auto
                                        LiveStreamFormat.HLS -> R.string.settings_format_hls
                                        LiveStreamFormat.TS -> R.string.settings_format_ts
                                    }
                                )
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = WebProColors.Primary,
                            selectedLabelColor = WebProColors.TextPrimary
                        )
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            Text(stringResource(R.string.settings_connection), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_connection_help),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextSecondary
            )
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ConnectionMode.entries.forEach { mode ->
                    FilterChip(
                        selected = settings.connectionMode == mode,
                        onClick = { viewModel.setConnectionMode(mode) },
                        label = {
                            Text(
                                stringResource(
                                    when (mode) {
                                        ConnectionMode.AUTO -> R.string.settings_connection_auto
                                        ConnectionMode.FAST -> R.string.settings_connection_fast
                                        ConnectionMode.SLOW -> R.string.settings_connection_slow
                                        ConnectionMode.VERY_SLOW -> R.string.settings_connection_very_slow
                                    }
                                )
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = WebProColors.Primary,
                            selectedLabelColor = WebProColors.TextPrimary
                        )
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            Text(stringResource(R.string.settings_quality), style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                stringResource(R.string.settings_quality_help),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextSecondary
            )
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MaxQuality.entries.forEach { quality ->
                    FilterChip(
                        selected = settings.maxQuality == quality,
                        onClick = { viewModel.setMaxQuality(quality) },
                        label = {
                            Text(
                                when (quality) {
                                    MaxQuality.AUTO -> stringResource(R.string.settings_quality_auto)
                                    else -> "${quality.maxHeight}p"
                                }
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = WebProColors.Primary,
                            selectedLabelColor = WebProColors.TextPrimary
                        )
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            HorizontalDivider(color = WebProColors.Outline)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(MaterialTheme.shapes.small)
                    .toggleable(
                        value = settings.autoPlayNextEpisode,
                        role = Role.Switch,
                        onValueChange = viewModel::setAutoPlayNext
                    )
                    .padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.settings_autoplay), style = MaterialTheme.typography.titleSmall)
                    Text(
                        stringResource(R.string.settings_autoplay_help),
                        style = MaterialTheme.typography.bodySmall,
                        color = WebProColors.TextSecondary
                    )
                }
                Spacer(Modifier.width(12.dp))
                Switch(checked = settings.autoPlayNextEpisode, onCheckedChange = null)
            }
        }

        SettingsCard(title = stringResource(R.string.settings_data)) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(onClick = { confirmLogout = true }) {
                    Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.settings_logout))
                }
                Button(
                    onClick = { confirmDelete = true },
                    colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Error)
                ) {
                    Icon(Icons.Rounded.DeleteForever, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.settings_delete_all))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.settings_data_help),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextSecondary
            )
        }

        SettingsCard(title = stringResource(R.string.settings_about)) {
            InfoRow(stringResource(R.string.settings_app_name), stringResource(R.string.app_name))
            InfoRow(stringResource(R.string.settings_version), "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.settings_about_text),
                style = MaterialTheme.typography.bodySmall,
                color = WebProColors.TextSecondary
            )
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text(stringResource(R.string.settings_logout)) },
            text = { Text(stringResource(R.string.settings_logout_confirm)) },
            confirmButton = {
                Button(onClick = {
                    confirmLogout = false
                    viewModel.logout()
                }) { Text(stringResource(R.string.settings_logout)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) { Text(stringResource(R.string.action_cancel)) }
            }
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.settings_delete_all)) },
            text = { Text(stringResource(R.string.settings_delete_confirm)) },
            confirmButton = {
                Button(
                    onClick = {
                        confirmDelete = false
                        viewModel.deleteAllData()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = WebProColors.Error)
                ) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.action_cancel)) }
            }
        )
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.large,
        color = WebProColors.Surface,
        modifier = Modifier
            .widthIn(max = 860.dp)
            .fillMaxWidth()
            .padding(bottom = 16.dp)
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = WebProColors.Accent)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.Top
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = WebProColors.TextSecondary,
            modifier = Modifier.width(170.dp)
        )
        Text(value, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}
