package com.webpro.player.desktop.storage

import com.sun.jna.platform.win32.Crypt32Util
import java.io.File
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Protects the IPTV password at rest.
 * - Windows: DPAPI (CryptProtectData), bound to the current Windows user account.
 * - Other OS (development): AES-256/GCM with a random key stored in the user data folder.
 */
interface SecretCipher {
    fun encrypt(plain: String): String?
    fun decrypt(encoded: String): String?

    companion object {
        fun forCurrentPlatform(dataDir: File): SecretCipher =
            if (AppDirs.isWindows) DpapiCipher() else AesFileKeyCipher(File(dataDir, ".key"))
    }
}

class DpapiCipher : SecretCipher {
    override fun encrypt(plain: String): String? = runCatching {
        Base64.getEncoder().encodeToString(Crypt32Util.cryptProtectData(plain.toByteArray(Charsets.UTF_8)))
    }.getOrNull()

    override fun decrypt(encoded: String): String? = runCatching {
        String(Crypt32Util.cryptUnprotectData(Base64.getDecoder().decode(encoded)), Charsets.UTF_8)
    }.getOrNull()
}

class AesFileKeyCipher(private val keyFile: File) : SecretCipher {
    private val random = SecureRandom()

    private val key: ByteArray by lazy {
        if (keyFile.isFile && keyFile.length() == 32L) keyFile.readBytes()
        else ByteArray(32).also {
            random.nextBytes(it)
            keyFile.parentFile?.mkdirs()
            keyFile.writeBytes(it)
            keyFile.setReadable(false, false)
            keyFile.setReadable(true, true)
        }
    }

    override fun encrypt(plain: String): String? = runCatching {
        val iv = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        Base64.getEncoder().encodeToString(iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8)))
    }.getOrNull()

    override fun decrypt(encoded: String): String? = runCatching {
        val payload = Base64.getDecoder().decode(encoded)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, payload, 0, 12))
        String(cipher.doFinal(payload, 12, payload.size - 12), Charsets.UTF_8)
    }.getOrNull()
}
