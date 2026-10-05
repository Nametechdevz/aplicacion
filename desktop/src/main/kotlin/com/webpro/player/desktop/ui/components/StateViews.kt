package com.webpro.player.desktop.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SearchOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webpro.player.desktop.ui.S
import com.webpro.player.ui.theme.WebProColors

@Composable
fun rememberShimmerBrush(): Brush {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -400f,
        targetValue = 1600f,
        animationSpec = infiniteRepeatable(tween(1300, easing = LinearEasing), RepeatMode.Restart),
        label = "shimmerX"
    )
    return Brush.linearGradient(
        colors = listOf(WebProColors.Surface, WebProColors.SurfaceHighest, WebProColors.Surface),
        start = Offset(x - 400f, 0f),
        end = Offset(x, 400f)
    )
}

@Composable
fun SkeletonGrid(minItemWidth: Dp, modifier: Modifier = Modifier, aspectRatio: Float = 2f / 3f) {
    val brush = rememberShimmerBrush()
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minItemWidth),
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(4.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        userScrollEnabled = false
    ) {
        items(24) {
            Column {
                Box(Modifier.fillMaxWidth().aspectRatio(aspectRatio).clip(MaterialTheme.shapes.medium).background(brush))
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth(0.8f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(brush))
            }
        }
    }
}

@Composable
fun SkeletonList(modifier: Modifier = Modifier, rows: Int = 12) {
    val brush = rememberShimmerBrush()
    Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        repeat(rows) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(width = 72.dp, height = 46.dp).clip(MaterialTheme.shapes.small).background(brush))
                Spacer(Modifier.width(14.dp))
                Box(Modifier.fillMaxWidth(0.5f).height(14.dp).clip(RoundedCornerShape(7.dp)).background(brush))
            }
        }
    }
}

@Composable
fun LoadingView(modifier: Modifier = Modifier, message: String? = null) {
    Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = WebProColors.Primary, strokeWidth = 3.dp)
        if (message != null) {
            Spacer(Modifier.height(16.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium, color = WebProColors.TextSecondary)
        }
    }
}

@Composable
fun ErrorView(message: String, onRetry: (() -> Unit)?, modifier: Modifier = Modifier, title: String = S.ERROR_TITLE) {
    StateMessage(
        icon = Icons.Rounded.CloudOff,
        tint = WebProColors.Error,
        title = title,
        message = message,
        modifier = modifier
    ) {
        if (onRetry != null) {
            Spacer(Modifier.height(22.dp))
            Button(onClick = onRetry) {
                Icon(Icons.Rounded.Refresh, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(S.RETRY)
            }
        }
    }
}

@Composable
fun EmptyView(title: String, message: String, modifier: Modifier = Modifier, icon: ImageVector = Icons.Rounded.SearchOff) {
    StateMessage(icon = icon, tint = WebProColors.Primary, title = title, message = message, modifier = modifier) {}
}

@Composable
private fun StateMessage(
    icon: ImageVector,
    tint: androidx.compose.ui.graphics.Color,
    title: String,
    message: String,
    modifier: Modifier,
    actions: @Composable () -> Unit
) {
    Column(
        modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(Modifier.size(76.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(38.dp))
        }
        Spacer(Modifier.height(18.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = WebProColors.TextSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = 520.dp)
        )
        actions()
    }
}
