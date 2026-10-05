package com.webpro.player.desktop.player

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.jetbrains.skia.ColorAlphaType
import org.jetbrains.skia.ColorType
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import uk.co.caprica.vlcj.player.base.MediaPlayer
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormat
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.BufferFormatCallback
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.RenderCallback
import uk.co.caprica.vlcj.player.embedded.videosurface.callback.format.RV32BufferFormat
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Receives decoded frames from libVLC (RV32/BGRA) and exposes them as Skia images for
 * Compose. The VLC thread only copies bytes into a small buffer pool; all Skia work
 * happens on the UI thread, so there is no tearing and frames are dropped (never
 * queued) when the UI is busy.
 */
class VideoFrameSink(private val uiScope: CoroutineScope) : BufferFormatCallback, RenderCallback {

    private class Frame(val bytes: ByteArray, val width: Int, val height: Int)

    private val pool = ConcurrentLinkedQueue<ByteArray>()
    private val latest = AtomicReference<Frame?>(null)
    private val uiScheduled = AtomicBoolean(false)

    @Volatile private var bufferWidth = 0
    @Volatile private var bufferHeight = 0
    @Volatile private var displayAspect = 0f

    // Real picture geometry reported by the decoder (libVLC pads its buffers).
    @Volatile private var videoWidth = 0
    @Volatile private var videoHeight = 0
    @Volatile private var sampleAspect = 1f

    /** Current frame (UI thread only). */
    var image: Image? = null
        private set

    /** Width/height ratio to show the picture with (honours anamorphic sources). */
    var aspectRatio: Float = 16f / 9f
        private set

    /** Visible part of [image] (the rest of the buffer is decoder padding). */
    var sourceWidth: Int = 0
        private set
    var sourceHeight: Int = 0
        private set

    /** True while frames arrive but the real geometry is still unknown. */
    val needsGeometry: Boolean get() = videoWidth == 0

    /** Called from the control thread with the decoder's real size and sample aspect ratio. */
    fun updateGeometry(width: Int, height: Int, sar: Float) {
        if (width <= 0 || height <= 0) return
        videoWidth = width
        videoHeight = height
        sampleAspect = if (sar.isFinite() && sar > 0f) sar else 1f
    }

    /** Incremented on every new frame; reading it in a draw scope schedules a redraw. */
    var frameTick by mutableIntStateOf(0)
        private set

    var hasVideo by mutableStateOf(false)
        private set

    // ---- BufferFormatCallback (VLC thread)
    override fun getBufferFormat(sourceWidth: Int, sourceHeight: Int): BufferFormat {
        bufferWidth = sourceWidth
        bufferHeight = sourceHeight
        pool.clear()
        return RV32BufferFormat(sourceWidth, sourceHeight)
    }

    override fun newFormatSize(bufferWidth: Int, bufferHeight: Int, displayWidth: Int, displayHeight: Int) {
        if (displayWidth > 0 && displayHeight > 0) displayAspect = displayWidth.toFloat() / displayHeight
    }

    override fun allocatedBuffers(buffers: Array<out ByteBuffer>) = Unit

    // ---- RenderCallback (VLC thread)
    override fun lock(mediaPlayer: MediaPlayer) = Unit
    override fun unlock(mediaPlayer: MediaPlayer) = Unit

    override fun display(
        mediaPlayer: MediaPlayer,
        nativeBuffers: Array<out ByteBuffer>,
        bufferFormat: BufferFormat,
        displayWidth: Int,
        displayHeight: Int
    ) {
        val source = nativeBuffers.firstOrNull() ?: return
        val width = bufferFormat.width
        val height = bufferFormat.height
        val size = width * height * 4
        if (size <= 0 || source.capacity() < size) return
        if (displayWidth > 0 && displayHeight > 0) displayAspect = displayWidth.toFloat() / displayHeight

        var target = pool.poll()
        if (target == null || target.size != size) target = ByteArray(size)
        source.rewind()
        source.get(target, 0, size)

        latest.getAndSet(Frame(target, width, height))?.let { dropped ->
            if (dropped.bytes.size == size) pool.offer(dropped.bytes)
        }
        if (uiScheduled.compareAndSet(false, true)) {
            uiScope.launch { publish() }
        }
    }

    // ---- UI thread
    private fun publish() {
        uiScheduled.set(false)
        val frame = latest.getAndSet(null) ?: return
        val info = ImageInfo(frame.width, frame.height, ColorType.BGRA_8888, ColorAlphaType.OPAQUE)
        val newImage = Image.makeRaster(info, frame.bytes, frame.width * 4)
        if (pool.size < POOL_SIZE) pool.offer(frame.bytes)
        image?.close()
        image = newImage
        val visibleW = videoWidth.takeIf { it in 1..frame.width } ?: frame.width
        val visibleH = videoHeight.takeIf { it in 1..frame.height } ?: frame.height
        sourceWidth = visibleW
        sourceHeight = visibleH
        aspectRatio = if (videoWidth > 0) visibleW * sampleAspect / visibleH
        else displayAspect.takeIf { it > 0f } ?: (visibleW.toFloat() / visibleH)
        if (!hasVideo) hasVideo = true
        frameTick++
    }

    /** Clears the picture (UI thread), e.g. when switching channels. */
    fun clear() {
        latest.set(null)
        videoWidth = 0
        videoHeight = 0
        sampleAspect = 1f
        image?.close()
        image = null
        hasVideo = false
        frameTick++
    }

    private companion object {
        const val POOL_SIZE = 3
    }
}
