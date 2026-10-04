package com.webpro.player.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.LoginPrefill
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.storage.SecureCipher
import com.webpro.player.storage.safeData
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

/**
 * Keeps the active session in memory and, when "remember connection" is enabled,
 * persists it in DataStore with the password encrypted by the Android Keystore.
 */
class SessionRepositoryImpl(
    private val dataStore: DataStore<Preferences>,
    private val cipher: SecureCipher,
    private val json: Json
) : SessionRepository {

    private val _session = MutableStateFlow<Session?>(null)
    override val session: StateFlow<Session?> = _session.asStateFlow()

    override suspend fun restore(): Boolean {
        _session.value?.let { return true }
        val prefs = dataStore.safeData().first()
        if (prefs[Keys.REMEMBER] != true) return false
        val server = prefs[Keys.SERVER] ?: return false
        val username = prefs[Keys.USERNAME] ?: return false
        val password = prefs[Keys.PASSWORD]?.let(cipher::decrypt) ?: return false
        val account = prefs[Keys.ACCOUNT]?.let { raw ->
            runCatching { json.decodeFromString(AccountInfo.serializer(), raw) }.getOrNull()
        }
        _session.value = Session(Credentials(server, username, password), account, remember = true)
        return true
    }

    override suspend fun saveSession(session: Session) {
        _session.value = session
        dataStore.edit { prefs ->
            prefs.clear()
            prefs[Keys.REMEMBER] = session.remember
            if (session.remember) {
                val encrypted = cipher.encrypt(session.credentials.password)
                prefs[Keys.SERVER] = session.credentials.serverUrl
                prefs[Keys.USERNAME] = session.credentials.username
                if (encrypted != null) prefs[Keys.PASSWORD] = encrypted
                session.account?.let { prefs[Keys.ACCOUNT] = json.encodeToString(AccountInfo.serializer(), it) }
            }
        }
    }

    override suspend fun updateAccount(account: AccountInfo) {
        val current = _session.value ?: return
        _session.value = current.copy(account = account)
        if (current.remember) {
            dataStore.edit { it[Keys.ACCOUNT] = json.encodeToString(AccountInfo.serializer(), account) }
        }
    }

    override suspend fun loginPrefill(): LoginPrefill? {
        val prefs = dataStore.safeData().first()
        val server = prefs[Keys.SERVER] ?: return null
        return LoginPrefill(server, prefs[Keys.USERNAME].orEmpty(), prefs[Keys.REMEMBER] ?: true)
    }

    override suspend fun logout() {
        _session.value = null
        dataStore.edit { prefs ->
            prefs.remove(Keys.PASSWORD)
            prefs.remove(Keys.ACCOUNT)
        }
    }

    override suspend fun clearAll() {
        _session.value = null
        dataStore.edit { it.clear() }
        cipher.deleteKey()
    }

    private object Keys {
        val SERVER = stringPreferencesKey("server_url")
        val USERNAME = stringPreferencesKey("username")
        val PASSWORD = stringPreferencesKey("password_encrypted")
        val ACCOUNT = stringPreferencesKey("account_info")
        val REMEMBER = booleanPreferencesKey("remember")
    }
}
