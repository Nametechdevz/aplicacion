package com.webpro.player.desktop.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import com.webpro.player.desktop.player.VideoFrameSink
import org.jetbrains.skia.FilterMipmap
import org.jetbrains.skia.FilterMode
import org.jetbrains.skia.MipmapMode
import org.jetbrains.skia.Rect

enum class ResizeMode(val label: String) {
    FIT("Ajustar"),
    ZOOM("Zoom (recortar)"),
    STRETCH("Estirar"),
    RATIO_16_9("16:9"),
    RATIO_4_3("4:3");

    fun next(): ResizeMode = entries[(ordinal + 1) % entries.size]
}

private val sampling = FilterMipmap(FilterMode.LINEAR, MipmapMode.NONE)

/** Draws the latest decoded frame. Only the draw phase is invalidated per frame (no recomposition). */
@Composable
fun VideoSurface(sink: VideoFrameSink, mode: ResizeMode, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxSize().clipToBounds()) {
        sink.frameTick // read the state so every new frame triggers a redraw
        val image = sink.image ?: return@Canvas
        val srcW = sink.sourceWidth.takeIf { it > 0 } ?: image.width
        val srcH = sink.sourceHeight.takeIf { it > 0 } ?: image.height
        val aspect = when (mode) {
            ResizeMode.RATIO_16_9 -> 16f / 9f
            ResizeMode.RATIO_4_3 -> 4f / 3f
            else -> sink.aspectRatio
        }
        val viewW = size.width
        val viewH = size.height
        val viewAspect = viewW / viewH
        val (dw, dh) = when (mode) {
            ResizeMode.STRETCH -> viewW to viewH
            ResizeMode.ZOOM -> if (aspect > viewAspect) viewH * aspect to viewH else viewW to viewW / aspect
            else -> if (aspect > viewAspect) viewW to viewW / aspect else viewH * aspect to viewH
        }
        val dx = (viewW - dw) / 2f
        val dy = (viewH - dh) / 2f
        drawIntoCanvas { canvas ->
            canvas.nativeCanvas.drawImageRect(
                image,
                Rect.makeWH(srcW.toFloat(), srcH.toFloat()),
                Rect.makeXYWH(dx, dy, dw, dh),
                sampling,
                null,
                true
            )
        }
    }
}
