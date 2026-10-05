package com.webpro.player.desktop.player

import com.sun.jna.NativeLibrary
import uk.co.caprica.vlcj.binding.support.runtime.RuntimeUtil
import uk.co.caprica.vlcj.factory.discovery.NativeDiscovery
import java.io.File

/**
 * Locates libVLC. The Windows installer ships VLC inside the app resources
 * (`<app>/vlc/libvlc.dll` + `plugins/`), so nothing has to be installed by the user.
 * A system-wide VLC 3.x installation is used as a fallback (useful during development).
 */
object VlcRuntime {

    @Volatile
    private var initialized: Boolean? = null

    @Synchronized
    fun initialize(): Boolean {
        initialized?.let { return it }
        val bundled = bundledVlcDir()
        val ok = if (bundled != null) {
            NativeLibrary.addSearchPath(RuntimeUtil.getLibVlcCoreLibraryName(), bundled.absolutePath)
            NativeLibrary.addSearchPath(RuntimeUtil.getLibVlcLibraryName(), bundled.absolutePath)
            // libvlccore must be loaded first so libvlc resolves it from the same folder.
            runCatching { NativeLibrary.getInstance(RuntimeUtil.getLibVlcCoreLibraryName()) }.isSuccess &&
                runCatching { NativeLibrary.getInstance(RuntimeUtil.getLibVlcLibraryName()) }.isSuccess
        } else {
            runCatching { NativeDiscovery().discover() }.getOrDefault(false)
        }
        initialized = ok
        return ok
    }

    /** Bundled VLC folder inside the packaged app, or a `-Dwebpro.vlcDir=` override. */
    fun bundledVlcDir(): File? {
        val candidates = listOfNotNull(
            System.getProperty("webpro.vlcDir"),
            System.getProperty("compose.application.resources.dir")?.let { "$it${File.separator}vlc" }
        )
        return candidates.map(::File).firstOrNull { dir ->
            dir.isDirectory && (File(dir, "libvlc.dll").isFile || File(dir, "libvlc.so").isFile ||
                File(dir, "libvlc.so.5").isFile || File(dir, "libvlc.dylib").isFile)
        }
    }
}
