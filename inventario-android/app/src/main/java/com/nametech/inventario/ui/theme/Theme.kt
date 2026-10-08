package com.nametech.inventario.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Green = Color(0xFF1E9E5A)
val Blue = Color(0xFF2F6FEB)
val Amber = Color(0xFFE59400)
val Red = Color(0xFFD93848)
val Gray = Color(0xFF7A7A8C)
val Purple = Color(0xFF5B3FD9)
val Teal = Color(0xFF00A396)

private val Light = lightColorScheme(
    primary = Purple,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE6E0FF),
    onPrimaryContainer = Color(0xFF1C0A6B),
    secondary = Teal,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFC9F2EC),
    onSecondaryContainer = Color(0xFF00201C),
    background = Color(0xFFF7F5FF),
    surface = Color(0xFFF7F5FF),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF0EDFA),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFC8BCFF),
    onPrimary = Color(0xFF2B1689),
    primaryContainer = Color(0xFF4329B8),
    onPrimaryContainer = Color(0xFFE6E0FF),
    secondary = Color(0xFF5FDBCB),
    onSecondary = Color(0xFF003731),
    secondaryContainer = Color(0xFF005048),
    onSecondaryContainer = Color(0xFFC9F2EC),
    background = Color(0xFF14121C),
    surface = Color(0xFF14121C),
    surfaceContainerLow = Color(0xFF1C1A26),
    surfaceContainer = Color(0xFF221F2D),
)

@Composable
fun InventarioTheme(themeMode: String = "SYSTEM", content: @Composable () -> Unit) {
    val dark = when (themeMode) {
        "DARK" -> true
        "LIGHT" -> false
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
