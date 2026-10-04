package com.webpro.player.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import java.io.IOException

// One DataStore instance per file for the whole process (required by DataStore).
val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "session")
val Context.favoritesDataStore: DataStore<Preferences> by preferencesDataStore(name = "favorites")
val Context.historyDataStore: DataStore<Preferences> by preferencesDataStore(name = "playback_history")
val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** Data flow that survives I/O read errors (corrupted or unreadable file). */
fun DataStore<Preferences>.safeData(): Flow<Preferences> = data.catch { error ->
    if (error is IOException) emit(emptyPreferences()) else throw error
}
