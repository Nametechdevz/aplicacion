package com.webpro.player.utils

/** Removes credentials from any text before it reaches the logs. */
object LogRedactor {
    private val queryCredentials = Regex("(?i)(password|username)=([^&\\s]+)")
    private val streamPath = Regex("(?i)/(live|movie|series|timeshift)/([^/\\s]+)/([^/\\s]+)/")

    fun redact(message: String): String = message
        .replace(queryCredentials) { "${it.groupValues[1]}=***" }
        .replace(streamPath) { "/${it.groupValues[1]}/***/***/" }
}
