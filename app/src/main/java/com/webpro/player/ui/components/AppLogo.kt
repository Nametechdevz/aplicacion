package com.webpro.player.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webpro.player.ui.theme.WebProBrushes
import com.webpro.player.ui.theme.WebProColors

@Composable
fun AppLogo(
    modifier: Modifier = Modifier,
    iconSize: Dp = 40.dp,
    textSize: TextUnit = 22.sp,
    showText: Boolean = true
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(iconSize)
                .clip(MaterialTheme.shapes.medium)
                .background(WebProBrushes.Brand),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Rounded.PlayArrow,
                contentDescription = null,
                tint = WebProColors.TextPrimary,
                modifier = Modifier.size(iconSize * 0.7f)
            )
        }
        if (!showText) return@Row
        Spacer(Modifier.width(12.dp))
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold, color = WebProColors.TextPrimary)) {
                    append("WEBPRO ")
                }
                withStyle(SpanStyle(fontWeight = FontWeight.Light, color = WebProColors.Accent)) {
                    append("PLAYER")
                }
            },
            fontSize = textSize,
            letterSpacing = 1.5.sp
        )
    }
}
