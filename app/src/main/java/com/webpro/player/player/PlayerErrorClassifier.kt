package com.webpro.player.player

import androidx.media3.common.PlaybackException
import java.io.EOFException
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.ProtocolException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

/** Maps Media3 error codes, HTTP status codes and exception causes to [PlayerError]. */
object PlayerErrorClassifier {

    fun classify(errorCode: Int, httpStatus: Int?, causes: List<Throwable>): PlayerError {
        if (httpStatus != null) {
            when (httpStatus) {
                401 -> return PlayerError.Unauthorized
                403 -> return PlayerError.Forbidden
                404, 410 -> return PlayerError.NotFound
                in 400..599 -> return PlayerError.ServerError(httpStatus)
            }
        }
        if (errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) return PlayerError.BehindLiveWindow
        if (errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
            errorCode == PlaybackException.ERROR_CODE_TIMEOUT ||
            causes.any { it is SocketTimeoutException }
        ) return PlayerError.Timeout
        if (causes.any { it.isConnectionReset() }) return PlayerError.ConnectionReset

        return when (errorCode) {
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_UNSPECIFIED -> PlayerError.Network

            PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND -> PlayerError.NotFound

            PlaybackException.ERROR_CODE_IO_NO_PERMISSION -> PlayerError.Forbidden

            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
            PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE,
            PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED,
            PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE,
            PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
            PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED,
            PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
            PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED -> PlayerError.Source

            PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
            PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED,
            PlaybackException.ERROR_CODE_DECODING_FAILED,
            PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES,
            PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
            PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED,
            PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED -> PlayerError.Decoder

            else -> when {
                causes.any { it is UnknownHostException || it is ConnectException || it is NoRouteToHostException } ->
                    PlayerError.Network
                causes.any { it is SSLException } -> PlayerError.Network
                causes.any { it is IOException } -> PlayerError.Network
                else -> PlayerError.Unknown
            }
        }
    }

    private fun Throwable.isConnectionReset(): Boolean {
        if (this is EOFException) return true
        if (this is ProtocolException && message?.contains("unexpected end", ignoreCase = true) == true) return true
        if (this !is SocketException && this !is IOException) return false
        val text = message?.lowercase() ?: return false
        return "reset" in text || "broken pipe" in text || "connection abort" in text ||
            "unexpected end of stream" in text || "stream was reset" in text
    }

    /** Flattens the cause chain (bounded, cycles are ignored). */
    fun causeChain(error: Throwable?): List<Throwable> {
        val result = ArrayList<Throwable>()
        var current = error
        while (current != null && result.size < 10 && current !in result) {
            result += current
            current = current.cause
        }
        return result
    }
}
