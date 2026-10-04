package com.webpro.player.domain.model

import kotlinx.serialization.Serializable

/** Credentials supplied by the user. The password must never be logged. */
data class Credentials(
    val serverUrl: String,
    val username: String,
    val password: String
) {
    override fun toString(): String = "Credentials(serverUrl=$serverUrl, username=$username, password=***)"
}

@Serializable
data class AccountInfo(
    val username: String,
    val status: String?,
    val expirationEpochSeconds: Long?,
    val isTrial: Boolean,
    val activeConnections: Int?,
    val maxConnections: Int?,
    val allowedOutputFormats: List<String>,
    val serverTimezone: String?
) {
    val isActive: Boolean
        get() = status == null || status.equals("active", ignoreCase = true)
}

/** A logged-in session. */
data class Session(
    val credentials: Credentials,
    val account: AccountInfo?,
    val remember: Boolean
)
