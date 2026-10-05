package com.webpro.player.desktop.storage

import java.io.File

/** Per-user data folder: %APPDATA%\WEBPRO PLAYER on Windows, ~/.webpro-player elsewhere. */
object AppDirs {
    val dataDir: File by lazy {
        val override = System.getProperty("webpro.dataDir")
        val dir = when {
            override != null -> File(override)
            isWindows -> File(System.getenv("APPDATA") ?: System.getProperty("user.home"), "WEBPRO PLAYER")
            else -> File(System.getProperty("user.home"), ".webpro-player")
        }
        dir.apply { mkdirs() }
    }

    val cacheDir: File by lazy {
        val local = if (isWindows) System.getenv("LOCALAPPDATA") else null
        val dir = if (local != null) File(local, "WEBPRO PLAYER\\cache") else File(dataDir, "cache")
        dir.apply { mkdirs() }
    }

    val isWindows: Boolean = System.getProperty("os.name").orEmpty().startsWith("Windows", ignoreCase = true)
}
