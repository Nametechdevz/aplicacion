package com.webpro.player.player

import androidx.media3.common.PlaybackException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class RetryAndErrorTest {

    @Test
    fun `retry policy is bounded exponential backoff`() {
        val policy = RetryPolicy()
        assertEquals(4, policy.maxAttempts)
        assertEquals(500L, policy.delayForAttempt(1))
        assertEquals(1_000L, policy.delayForAttempt(2))
        assertEquals(2_000L, policy.delayForAttempt(3))
        assertEquals(4_000L, policy.delayForAttempt(4))
        assertNull(policy.delayForAttempt(5))
        assertNull(policy.delayForAttempt(0))
    }

    @Test
    fun `http auth errors are not retried`() {
        val e401 = PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 401, emptyList())
        val e403 = PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 403, emptyList())
        assertEquals(PlayerError.Unauthorized, e401)
        assertEquals(PlayerError.Forbidden, e403)
        assertFalse(e401.recoverable)
        assertFalse(e403.recoverable)
        assertFalse(e403.tryAlternativeSource)
    }

    @Test
    fun `404 switches format but is not retried`() {
        val error = PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 404, emptyList())
        assertEquals(PlayerError.NotFound, error)
        assertFalse(error.recoverable)
        assertTrue(error.tryAlternativeSource)
    }

    @Test
    fun `server errors 5xx are recoverable`() {
        val error = PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, 503, emptyList())
        assertEquals(PlayerError.ServerError(503), error)
        assertTrue(error.recoverable)
    }

    @Test
    fun `network family`() {
        assertEquals(
            PlayerError.Timeout,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_UNSPECIFIED, null, listOf(SocketTimeoutException()))
        )
        assertEquals(
            PlayerError.ConnectionReset,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_UNSPECIFIED, null, listOf(SocketException("Connection reset")))
        )
        assertEquals(
            PlayerError.Network,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED, null, listOf(UnknownHostException()))
        )
        assertEquals(
            PlayerError.Network,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_UNSPECIFIED, null, listOf(IOException("io")))
        )
    }

    @Test
    fun `live window decoder and source errors`() {
        assertEquals(
            PlayerError.BehindLiveWindow,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW, null, emptyList())
        )
        assertEquals(
            PlayerError.Decoder,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_DECODER_INIT_FAILED, null, emptyList())
        )
        assertEquals(
            PlayerError.Source,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED, null, emptyList())
        )
        assertEquals(
            PlayerError.Unknown,
            PlayerErrorClassifier.classify(PlaybackException.ERROR_CODE_UNSPECIFIED, null, emptyList())
        )
    }

    @Test
    fun `cause chain is bounded and cycle safe`() {
        val root = IOException("root")
        val wrapper = RuntimeException("wrapper", root)
        assertEquals(listOf<Throwable>(wrapper, root), PlayerErrorClassifier.causeChain(wrapper))
        assertTrue(PlayerErrorClassifier.causeChain(null).isEmpty())
    }
}
