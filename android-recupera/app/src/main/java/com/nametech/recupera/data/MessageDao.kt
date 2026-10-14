package com.nametech.recupera.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface MessageDao {

    /** Ignora el insert si ya existe un mensaje idéntico (índice único). */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(message: Message): Long

    @Query("SELECT * FROM messages ORDER BY timestamp DESC, id DESC")
    fun all(): Flow<List<Message>>

    @Query("SELECT * FROM messages WHERE isDeletedMarker = 1 ORDER BY timestamp DESC, id DESC")
    fun deletedMarkers(): Flow<List<Message>>

    @Query("SELECT * FROM messages WHERE chatKey = :chat ORDER BY timestamp ASC, id ASC")
    fun forChat(chat: String): Flow<List<Message>>

    @Query("SELECT COUNT(*) FROM messages")
    fun count(): Flow<Int>

    @Query("DELETE FROM messages")
    suspend fun clearAll()

    @Query("DELETE FROM messages WHERE chatKey = :chat")
    suspend fun clearChat(chat: String)
}
