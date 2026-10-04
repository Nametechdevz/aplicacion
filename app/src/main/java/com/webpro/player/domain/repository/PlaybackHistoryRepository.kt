package com.webpro.player.domain.repository

import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.ResumePoint
import kotlinx.coroutines.flow.Flow

interface PlaybackHistoryRepository {
    val resumePoints: Flow<Map<String, ResumePoint>>
    suspend fun get(type: ContentType, id: Long): ResumePoint?
    suspend fun save(point: ResumePoint)
    suspend fun remove(type: ContentType, id: Long)

    /** Most recently watched episode of a series, if any. */
    fun lastEpisodeOfSeries(seriesId: Long): Flow<ResumePoint?>
    suspend fun clear()
}
