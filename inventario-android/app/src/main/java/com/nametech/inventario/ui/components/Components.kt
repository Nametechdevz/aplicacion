package com.nametech.inventario.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.SportsEsports
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.VpnKey
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.Category
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.ui.theme.Amber
import com.nametech.inventario.ui.theme.Blue
import com.nametech.inventario.ui.theme.Gray
import com.nametech.inventario.ui.theme.Green
import com.nametech.inventario.ui.theme.Red
import com.nametech.inventario.util.Fmt
import com.nametech.inventario.util.copyToClipboard

fun Category.icon(): ImageVector = when (this) {
    Category.STREAMING -> Icons.Filled.LiveTv
    Category.IPTV -> Icons.Filled.Tv
    Category.CURSO -> Icons.Filled.School
    Category.SISTEMA_WEB -> Icons.Filled.Language
    Category.APLICACION -> Icons.Filled.Apps
    Category.LICENCIA -> Icons.Filled.VpnKey
    Category.JUEGOS -> Icons.Filled.SportsEsports
    Category.OTRO -> Icons.Filled.Inventory2
}

fun Category.color(): Color = when (this) {
    Category.STREAMING -> Color(0xFFE50914)
    Category.IPTV -> Color(0xFF7B1FA2)
    Category.CURSO -> Color(0xFF2F6FEB)
    Category.SISTEMA_WEB -> Color(0xFF00897B)
    Category.APLICACION -> Color(0xFF5B3FD9)
    Category.LICENCIA -> Color(0xFFEF6C00)
    Category.JUEGOS -> Color(0xFF2E7D32)
    Category.OTRO -> Color(0xFF546E7A)
}

@Composable
fun CategoryAvatar(category: Category, size: Int = 44) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .background(category.color().copy(alpha = 0.15f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(category.icon(), contentDescription = category.label, tint = category.color(), modifier = Modifier.size((size * 0.55).dp))
    }
}

@Composable
fun Badge(text: String, color: Color) {
    Surface(color = color.copy(alpha = 0.15f), shape = RoundedCornerShape(50)) {
        Text(
            text,
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

/** Insignias de estado: disponible/vendida/inactiva + por vencer/vencida + por cobrar. */
@Composable
fun StatusBadges(item: Item, today: Long, dueSoonDays: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        when (item.status) {
            ItemStatus.AVAILABLE -> Badge("Disponible", Green)
            ItemStatus.SOLD -> Badge("Vendida", Blue)
            else -> Badge("Inactiva", Gray)
        }
        if (item.status != ItemStatus.INACTIVE) {
            when (item.timeState(today, dueSoonDays)) {
                TimeState.DUE_SOON -> Badge("Por vencer", Amber)
                TimeState.EXPIRED -> Badge("Vencida", Red)
                else -> {}
            }
        }
        if (item.status == ItemStatus.SOLD && !item.paid) Badge("Por cobrar", Red)
    }
}

fun timeColor(state: TimeState): Color = when (state) {
    TimeState.EXPIRED -> Red
    TimeState.DUE_SOON -> Amber
    TimeState.OK -> Green
    TimeState.NONE -> Gray
}

@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            if (title != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    action?.invoke()
                }
                Spacer(Modifier.height(8.dp))
            }
            content()
        }
    }
}

@Composable
fun InfoRow(label: String, value: String, copyable: Boolean = false, secret: Boolean = false, onClick: (() -> Unit)? = null) {
    if (value.isBlank()) return
    val context = LocalContext.current
    var show by remember { mutableStateOf(!secret) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                if (show) value else "•".repeat(value.length.coerceAtMost(12)),
                style = MaterialTheme.typography.bodyLarge,
                color = if (onClick != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
        }
        if (secret) {
            IconButton(onClick = { show = !show }) {
                Icon(if (show) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "Mostrar")
            }
        }
        if (copyable) {
            IconButton(onClick = { context.copyToClipboard(label, value) }) {
                Icon(Icons.Filled.ContentCopy, contentDescription = "Copiar")
            }
        }
    }
}

@Composable
fun SimpleField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    minLines: Int = 1,
    password: Boolean = false,
    leading: ImageVector? = null,
    supporting: String? = null,
) {
    var visible by remember { mutableStateOf(!password) }
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        singleLine = singleLine,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        leadingIcon = leading?.let { { Icon(it, contentDescription = null) } },
        supportingText = supporting?.let { { Text(it) } },
        trailingIcon = if (password) {
            {
                IconButton(onClick = { visible = !visible }) {
                    Icon(if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = "Mostrar")
                }
            }
        } else null,
    )
}

/** Campo de fecha que abre un selector. [value] en días desde época. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(
    label: String,
    value: Long?,
    onChange: (Long?) -> Unit,
    modifier: Modifier = Modifier,
    clearable: Boolean = true,
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = if (value == null) "" else Fmt.date(value),
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            placeholder = { Text("Sin fecha") },
            leadingIcon = { Icon(Icons.Filled.CalendarMonth, contentDescription = null) },
            trailingIcon = if (clearable && value != null) {
                { IconButton(onClick = { onChange(null) }) { Icon(Icons.Filled.Clear, contentDescription = "Quitar fecha") } }
            } else null,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        // Capa táctil sobre el campo (deja libre el botón de borrar).
        Box(
            Modifier
                .matchParentSize()
                .padding(end = if (clearable && value != null) 48.dp else 0.dp)
                .clickable { open = true },
        )
    }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = (value ?: com.nametech.inventario.domain.today()) * DAY_MS)
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(Math.floorDiv(it, DAY_MS)) }
                    open = false
                }) { Text("Aceptar") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancelar") } },
        ) { DatePicker(state = state) }
    }
}

const val DAY_MS = 86_400_000L

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirm: String = "Aceptar",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun EmptyState(icon: ImageVector, title: String, subtitle: String = "") {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f))
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (subtitle.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier, color: Color = Color.Unspecified) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun SpacerW(dp: Int) = Spacer(Modifier.width(dp.dp))

@Composable
fun SpacerH(dp: Int) = Spacer(Modifier.height(dp.dp))
