package com.webpro.player.domain.repository

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.model.SeriesDetails

/**
 * Access to the Xtream Codes API of the server configured by the user.
 * Lists are cached in memory, so repeated calls do not hit the network unless
 * [forceRefresh] is requested.
 */
interface XtreamRepository {
    suspend fun authenticate(credentials: Credentials): DataResult<AccountInfo>

    suspend fun liveCategories(forceRefresh: Boolean = false): DataResult<List<Category>>
    suspend fun liveChannels(forceRefresh: Boolean = false): DataResult<List<LiveChannel>>

    suspend fun movieCategories(forceRefresh: Boolean = false): DataResult<List<Category>>
    suspend fun movies(forceRefresh: Boolean = false): DataResult<List<Movie>>
    suspend fun movieDetails(movieId: Long): DataResult<MovieDetails>

    suspend fun seriesCategories(forceRefresh: Boolean = false): DataResult<List<Category>>
    suspend fun series(forceRefresh: Boolean = false): DataResult<List<Series>>
    suspend fun seriesDetails(seriesId: Long, forceRefresh: Boolean = false): DataResult<SeriesDetails>

    /** Cached values only; never triggers network requests. */
    fun cachedLiveChannels(): List<LiveChannel>?
    fun cachedMovie(movieId: Long): Movie?

    /** Drops every cached list (used on logout or server change). */
    fun clearCache()
}
