package com.webpro.player.desktop.storage

import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveStreamFormat
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.Session
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class DesktopStorageTest {
    private val json = Json { ignoreUnknownKeys = true }
    private fun tempDir(): File = Files.createTempDirectory("webpro-store").toFile()

    @Test
    fun `aes cipher round trip and tamper detection`() {
        val dir = tempDir()
        val cipher = AesFileKeyCipher(File(dir, ".key"))
        val encrypted = cipher.encrypt("s3cr3t-ñ")!!
        assertNotEquals("s3cr3t-ñ", encrypted)
        assertEquals("s3cr3t-ñ", cipher.decrypt(encrypted))
        // Same key file -> same result after restart.
        assertEquals("s3cr3t-ñ", AesFileKeyCipher(File(dir, ".key")).decrypt(encrypted))
        assertNull(cipher.decrypt("not-base64!!"))
        assertNull(AesFileKeyCipher(File(tempDir(), ".key")).decrypt(encrypted))
    }

    @Test
    fun `remembered session survives restart and password is never stored in clear`() = runTest {
        val dir = tempDir()
        val cipher = AesFileKeyCipher(File(dir, ".key"))
        val session = Session(Credentials("http://s.com:8080", "juan", "clave-secreta"), null, remember = true)
        DesktopSessionRepository(dir, json, cipher).saveSession(session)
        assertFalse(File(dir, "session.json").readText().contains("clave-secreta"))

        val restored = DesktopSessionRepository(dir, json, cipher)
        assertTrue(restored.restore())
        assertEquals(session.credentials, restored.session.value!!.credentials)

        restored.logout()
        val afterLogout = DesktopSessionRepository(dir, json, cipher)
        assertFalse(afterLogout.restore())
        assertEquals("juan", afterLogout.loginPrefill()!!.username)
    }

    @Test
    fun `not remembered session leaves nothing on disk`() = runTest {
        val dir = tempDir()
        val repo = DesktopSessionRepository(dir, json, AesFileKeyCipher(File(dir, ".key")))
        repo.saveSession(Session(Credentials("http://s.com", "ana", "pw"), null, remember = false))
        assertEquals("ana", repo.session.value!!.credentials.username)
        assertFalse(File(dir, "session.json").readText().contains("ana"))
        assertNull(repo.loginPrefill())
    }

    @Test
    fun `favorites toggle and persist`() = runTest {
        val dir = tempDir()
        val repo = FileFavoritesRepository(dir, json)
        val item = FavoriteItem(ContentType.LIVE, 7, "Canal 7")
        assertTrue(repo.toggle(item))
        assertEquals(setOf("LIVE:7"), FileFavoritesRepository(dir, json).favoriteKeys().first())
        assertFalse(repo.toggle(item))
        assertTrue(repo.favorites.first().isEmpty())
    }

    @Test
    fun `history keeps latest point per item and corrupted files fall back to defaults`() = runTest {
        val dir = tempDir()
        val repo = FileHistoryRepository(dir, json)
        repo.save(ResumePoint(ContentType.MOVIE, 1, 10_000, 100_000, 1))
        repo.save(ResumePoint(ContentType.MOVIE, 1, 20_000, 100_000, 2))
        assertEquals(20_000L, repo.get(ContentType.MOVIE, 1)!!.positionMs)

        File(dir, "settings.json").writeText("{ this is not json")
        val settings = FileSettingsRepository(dir, json)
        assertEquals(LiveStreamFormat.TS, settings.current().liveStreamFormat)
        settings.setVolume(400)
        assertEquals(FileSettingsRepository.MAX_VOLUME, FileSettingsRepository(dir, json).desktopSettings.value.volume)
    }
}
