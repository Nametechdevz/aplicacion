package com.webpro.player.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlNormalizerTest {

    private fun valid(input: String): UrlNormalizer.Result.Valid {
        val result = UrlNormalizer.normalize(input)
        assertTrue("Expected valid for '$input' but was $result", result is UrlNormalizer.Result.Valid)
        return result as UrlNormalizer.Result.Valid
    }

    private fun invalid(input: String?): UrlNormalizer.Reason {
        val result = UrlNormalizer.normalize(input)
        assertTrue("Expected invalid for '$input' but was $result", result is UrlNormalizer.Result.Invalid)
        return (result as UrlNormalizer.Result.Invalid).reason
    }

    @Test
    fun `keeps a valid url untouched`() {
        assertEquals("http://servidor.com:8080", valid("http://servidor.com:8080").baseUrl)
        assertEquals("https://servidor.com:2083", valid("https://servidor.com:2083").baseUrl)
    }

    @Test
    fun `adds http scheme when missing`() {
        assertEquals("http://servidor.com:8080", valid("servidor.com:8080").baseUrl)
        assertEquals("http://192.168.1.10:25461", valid("192.168.1.10:25461").baseUrl)
    }

    @Test
    fun `removes trailing slashes and whitespace`() {
        assertEquals("http://servidor.com:8080", valid("  http://servidor.com:8080///  ").baseUrl)
    }

    @Test
    fun `repairs malformed schemes`() {
        assertEquals("http://servidor.com:8080", valid("http:/servidor.com:8080").baseUrl)
        assertEquals("http://servidor.com:8080", valid("http//servidor.com:8080").baseUrl)
        assertEquals("https://servidor.com", valid("HTTPS://Servidor.com").baseUrl)
        assertEquals("http://servidor.com", valid("http:///servidor.com").baseUrl)
    }

    @Test
    fun `keeps sub paths but removes script names`() {
        assertEquals("http://servidor.com/panel", valid("http://servidor.com/panel/").baseUrl)
        assertEquals("http://servidor.com:8080", valid("http://servidor.com:8080/player_api.php").baseUrl)
    }

    @Test
    fun `extracts credentials from a pasted m3u link`() {
        val result = valid("http://servidor.com:8080/get.php?username=juan&password=secreto&type=m3u_plus")
        assertEquals("http://servidor.com:8080", result.baseUrl)
        assertEquals("juan", result.username)
        assertEquals("secreto", result.password)
        assertTrue("password must be hidden in toString", !result.toString().contains("secreto"))
    }

    @Test
    fun `plain url has no credentials`() {
        val result = valid("http://servidor.com")
        assertNull(result.username)
        assertNull(result.password)
    }

    @Test
    fun `rejects empty, unsupported and malformed input`() {
        assertEquals(UrlNormalizer.Reason.EMPTY, invalid(""))
        assertEquals(UrlNormalizer.Reason.EMPTY, invalid("   "))
        assertEquals(UrlNormalizer.Reason.EMPTY, invalid(null))
        assertEquals(UrlNormalizer.Reason.UNSUPPORTED_SCHEME, invalid("rtmp://servidor.com"))
        assertEquals(UrlNormalizer.Reason.MALFORMED, invalid("http://"))
        assertEquals(UrlNormalizer.Reason.MALFORMED, invalid("http://servidor.com:99999"))
        assertEquals(UrlNormalizer.Reason.MALFORMED, invalid("http://.com"))
    }

    @Test
    fun `api base always ends with a slash`() {
        assertEquals("http://servidor.com:8080/", UrlNormalizer.apiBase("http://servidor.com:8080"))
        assertEquals("http://servidor.com/panel/", UrlNormalizer.apiBase("http://servidor.com/panel/"))
    }
}
