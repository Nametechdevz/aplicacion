package com.webpro.player.desktop.player

/** libVLC arguments tuned for IPTV (live MPEG-TS/HLS and VOD over HTTP). */
object VlcOptions {

    const val USER_AGENT = "WEBPRO PLAYER/1.0 (Windows) LibVLC/3"

    /** Instance-wide arguments (applied when the engine is created). */
    fun factoryArgs(hardwareDecoding: Boolean, extra: List<String> = emptyList()): List<String> = buildList {
        add("--no-video-title-show")
        add("--no-snapshot-preview")
        add("--no-osd")
        add("--no-stats")
        add("--no-sub-autodetect-file")
        add("--quiet")
        // Hardware decoding (D3D11/DXVA2 on Windows) with automatic software fallback.
        add(if (hardwareDecoding) "--avcodec-hw=any" else "--avcodec-hw=none")
        add("--avcodec-threads=0")
        // Many TV channels are interlaced (1080i/576i): deinterlace automatically.
        add("--deinterlace=-1")
        add("--deinterlace-mode=yadif")
        // Keep A/V in sync on unstable streams instead of stalling.
        add("--drop-late-frames")
        add("--skip-frames")
        add("--audio-time-stretch")
        add("--http-user-agent=$USER_AGENT")
        addAll(extra)
    }

    /** Per-media options. */
    fun mediaOptions(isLive: Boolean, networkCachingMs: Int, startPositionMs: Long): Array<String> = buildList {
        val caching = if (isLive) networkCachingMs else maxOf(networkCachingMs, VOD_MIN_CACHING_MS)
        add(":network-caching=$caching")
        add(":live-caching=$caching")
        add(":http-reconnect")
        add(":http-user-agent=$USER_AGENT")
        add(":ipv4-timeout=8000")
        if (!isLive && startPositionMs > 0) {
            add(":start-time=${startPositionMs / 1000.0}")
        }
    }.toTypedArray()

    /** Extra arguments from `-Dwebpro.vlc.args="--aout=dummy;--vout=dummy"` (diagnostics/tests). */
    fun extraArgsFromSystem(): List<String> =
        System.getProperty("webpro.vlc.args").orEmpty().split(';').map { it.trim() }.filter { it.isNotEmpty() }

    private const val VOD_MIN_CACHING_MS = 3000
}
