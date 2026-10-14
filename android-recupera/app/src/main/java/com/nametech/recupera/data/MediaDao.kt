package com.nametech.recupera.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface MediaDao {

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(item: MediaItem): Long

    @Query("SELECT * FROM media ORDER BY sourceModified DESC, id DESC")
    fun all(): Flow<List<MediaItem>>

    @Query("SELECT * FROM media WHERE type = :type ORDER BY sourceModified DESC, id DESC")
    fun byType(type: MediaType): Flow<List<MediaItem>>

    /** Para saber de un vistazo qué archivos ya están copiados. */
    @Query("SELECT sourcePath || '|' || size FROM media")
    suspend fun existingKeys(): List<String>

    @Query("SELECT COUNT(*) FROM media")
    fun count(): Flow<Int>

    @Query("DELETE FROM media")
    suspend fun clearAll()
}
