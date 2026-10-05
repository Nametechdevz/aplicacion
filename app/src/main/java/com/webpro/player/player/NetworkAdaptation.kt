package com.webpro.player.player

import com.webpro.player.domain.model.ConnectionMode
import com.webpro.player.domain.model.MaxQuality

/**
 * Buffer sizes per connection level. Bigger buffers start a bit later but absorb slow or
 * unstable connections, so playback does not stop every few seconds.
 *
 * @param liveCachingMs / vodCachingMs network cache used by libVLC (desktop)
 * @param minBufferMs / maxBufferMs / startBufferMs / rebufferMs Media3 load control (Android)
 * @param targetBufferBytes memory budget of the Android buffer
 * @param autoMaxHeight quality cap applied in AUTO quality for adaptive (multi-bitrate) HLS
 * @param liveTargetOffsetMs distance kept from the live edge (HLS): more room to buffer segments
 */
enum class BufferProfile(
    val liveCachingMs: Int,
    val vodCachingMs: Int,
    val minBufferMs: Int,
    val maxBufferMs: Int,
    val startBufferMs: Int,
    val rebufferMs: Int,
    val targetBufferBytes: Int,
    val autoMaxHeight: Int?,
    val liveTargetOffsetMs: Long?
) {
    FAST(1_500, 3_000, 15_000, 50_000, 1_500, 3_000, 32 * MB, null, null),
    NORMAL(3_000, 5_000, 20_000, 60_000, 2_500, 5_000, 48 * MB, null, null),
    SLOW(7_000, 12_000, 40_000, 120_000, 5_000, 10_000, 64 * MB, 720, 20_000),
    VERY_SLOW(14_000, 20_000, 60_000, 180_000, 8_000, 16_000, 96 * MB, 480, 30_000);

    fun slower(): BufferProfile = entries.getOrElse(ordinal + 1) { this }
    fun faster(): BufferProfile = entries.getOrElse(ordinal - 1) { this }

    /** Effective video height cap for the user's quality preference. */
    fun maxHeight(quality: MaxQuality): Int? = quality.maxHeight ?: autoMaxHeight

    companion object {
        fun fromName(value: String?): BufferProfile? = entries.firstOrNull { it.name == value }

        /** Initial level: fixed modes map directly; AUTO reuses what was learned (or NORMAL). */
        fun initial(mode: ConnectionMode, learned: BufferProfile?, estimatedBitrateBps: Long? = null): BufferProfile =
            when (mode) {
                ConnectionMode.FAST -> FAST
                ConnectionMode.SLOW -> SLOW
                ConnectionMode.VERY_SLOW -> VERY_SLOW
                ConnectionMode.AUTO -> {
                    val fromBandwidth = when {
                        estimatedBitrateBps == null || estimatedBitrateBps <= 0 -> NORMAL
                        estimatedBitrateBps < 1_500_000 -> VERY_SLOW
                        estimatedBitrateBps < 4_000_000 -> SLOW
                        else -> NORMAL
                    }
                    listOfNotNull(learned, fromBandwidth).maxBy { it.ordinal }
                }
            }
    }
}

private const val MB = 1024 * 1024

/**
 * Detects a connection that cannot keep up (repeated rebuffering) and raises the buffer
 * level one step at a time. Bounded: at most [BufferProfile.VERY_SLOW], never loops.
 * Only adapts in [ConnectionMode.AUTO]; fixed modes are respected as chosen by the user.
 */
class AdaptiveBufferController(
    private val mode: ConnectionMode,
    initial: BufferProfile,
    private val stallsToEscalate: Int = 2,
    private val windowMs: Long = 90_000,
    private val clock: () -> Long = System::currentTimeMillis
) {
    var profile: BufferProfile = initial
        private set

    private val stalls = ArrayDeque<Long>()

    /**
     * Records a rebuffer (playback stalled after it had started). Returns true when the
     * level was raised and the caller should reopen the stream with the new buffer.
     */
    fun onRebuffer(): Boolean {
        if (mode != ConnectionMode.AUTO) return false
        val now = clock()
        stalls.addLast(now)
        while (stalls.isNotEmpty() && now - stalls.first() > windowMs) stalls.removeFirst()
        if (stalls.size < stallsToEscalate || profile == BufferProfile.VERY_SLOW) return false
        profile = profile.slower()
        stalls.clear()
        return true
    }

    /** A new item starts: forget stalls of the previous one (the learned level is kept). */
    fun onNewItem() {
        stalls.clear()
    }
}

/** User preferences that shape buffering for one playback. */
data class PlaybackTuning(
    val mode: ConnectionMode = ConnectionMode.AUTO,
    val maxQuality: MaxQuality = MaxQuality.AUTO,
    val learned: BufferProfile? = null
)
