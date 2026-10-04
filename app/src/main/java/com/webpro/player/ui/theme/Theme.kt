package com.webpro.player.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp

private val WebProColorScheme = darkColorScheme(
    primary = WebProColors.Primary,
    onPrimary = WebProColors.TextPrimary,
    primaryContainer = WebProColors.PrimaryDark,
    onPrimaryContainer = WebProColors.TextPrimary,
    secondary = WebProColors.Secondary,
    onSecondary = WebProColors.TextPrimary,
    secondaryContainer = WebProColors.SurfaceHighest,
    onSecondaryContainer = WebProColors.TextPrimary,
    tertiary = WebProColors.Accent,
    background = WebProColors.Background,
    onBackground = WebProColors.TextPrimary,
    surface = WebProColors.Surface,
    onSurface = WebProColors.TextPrimary,
    surfaceVariant = WebProColors.SurfaceRaised,
    onSurfaceVariant = WebProColors.TextSecondary,
    surfaceContainer = WebProColors.Surface,
    surfaceContainerHigh = WebProColors.SurfaceRaised,
    surfaceContainerHighest = WebProColors.SurfaceHighest,
    surfaceContainerLow = WebProColors.Surface,
    surfaceContainerLowest = WebProColors.Background,
    outline = WebProColors.Outline,
    outlineVariant = WebProColors.Outline,
    error = WebProColors.Error,
    onError = WebProColors.TextPrimary
)

private val WebProShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

object WebProBrushes {
    val Brand = Brush.linearGradient(listOf(WebProColors.Primary, WebProColors.Secondary))
    val BackgroundGlow = Brush.verticalGradient(
        listOf(WebProColors.SurfaceRaised, WebProColors.Background, WebProColors.Background)
    )
}

@Composable
fun WebProTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WebProColorScheme,
        typography = WebProTypography,
        shapes = WebProShapes,
        content = content
    )
}
