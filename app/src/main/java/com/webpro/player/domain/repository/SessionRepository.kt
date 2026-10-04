package com.webpro.player.domain.repository

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.Session
import kotlinx.coroutines.flow.StateFlow

data class LoginPrefill(val serverUrl: String, val username: String, val remember: Boolean)

interface SessionRepository {
    /** Current session, or null when the user is logged out. */
    val session: StateFlow<Session?>

    /** Restores a remembered session from secure storage. Returns true if one was found. */
    suspend fun restore(): Boolean

    suspend fun saveSession(session: Session)
    suspend fun updateAccount(account: AccountInfo)

    /** Values to prefill the login form (never includes the password). */
    suspend fun loginPrefill(): LoginPrefill?

    /** Ends the session and forgets the password, keeping server and user for convenience. */
    suspend fun logout()

    /** Removes every stored value of the session. */
    suspend fun clearAll()
}
