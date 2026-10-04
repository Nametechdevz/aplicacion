package com.webpro.player.data.repository

import com.webpro.player.data.api.InvalidXtreamResponseException
import com.webpro.player.data.api.JsonResponseReader
import com.webpro.player.data.api.XtreamApiFactory
import com.webpro.player.data.api.XtreamService
import com.webpro.player.data.api.XtreamService.Actions
import com.webpro.player.data.model.AuthParseResult
import com.webpro.player.data.model.XtreamParsers
import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.domain.repository.XtreamRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import okhttp3.ResponseBody
import retrofit2.Response
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException

class XtreamRepositoryImpl(
    private val apiFactory: XtreamApiFactory,
    private val reader: JsonResponseReader,
    private val credentialsProvider: () -> Credentials?,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    private val clock: () -> Long = System::currentTimeMillis
) : XtreamRepository {

    private val liveCategoriesSlot = CacheSlot<List<Category>>(LIST_TTL, clock)
    private val liveChannelsSlot = CacheSlot<List<LiveChannel>>(LIST_TTL, clock)
    private val movieCategoriesSlot = CacheSlot<List<Category>>(LIST_TTL, clock)
    private val moviesSlot = CacheSlot<List<Movie>>(LIST_TTL, clock)
    private val seriesCategoriesSlot = CacheSlot<List<Category>>(LIST_TTL, clock)
    private val seriesSlot = CacheSlot<List<Series>>(LIST_TTL, clock)
    private val movieDetailsCache = LruCache<String, MovieDetails>(DETAILS_CACHE_SIZE)
    private val seriesDetailsCache = LruCache<String, SeriesDetails>(DETAILS_CACHE_SIZE)

    override suspend fun authenticate(credentials: Credentials): DataResult<AccountInfo> = safeCall {
        val service = apiFactory.serviceFor(credentials.serverUrl)
        val response = service.authenticate(credentials.username, credentials.password)
        when (response.code()) {
            401, 403 -> return@safeCall DataResult.Failure(AppError.InvalidCredentials)
            404 -> return@safeCall DataResult.Failure(AppError.NotFound)
        }
        val body = response.bodyOrError() ?: return@safeCall DataResult.Failure(httpError(response.code()))
        val root = body.use { reader.readElement(it) }
        when (val parsed = XtreamParsers.parseAuth(root, credentials.username)) {
            is AuthParseResult.Authenticated -> DataResult.Success(parsed.account)
            AuthParseResult.InvalidCredentials -> DataResult.Failure(AppError.InvalidCredentials)
            AuthParseResult.NotXtream -> DataResult.Failure(AppError.InvalidResponse)
        }
    }

    override suspend fun liveCategories(forceRefresh: Boolean) =
        cachedList(liveCategoriesSlot, forceRefresh, Actions.LIVE_CATEGORIES, XtreamParsers::parseCategory) { it.id }

    override suspend fun liveChannels(forceRefresh: Boolean) =
        cachedList(liveChannelsSlot, forceRefresh, Actions.LIVE_STREAMS, XtreamParsers::parseLiveChannel) { it.streamId }

    override suspend fun movieCategories(forceRefresh: Boolean) =
        cachedList(movieCategoriesSlot, forceRefresh, Actions.VOD_CATEGORIES, XtreamParsers::parseCategory) { it.id }

    override suspend fun movies(forceRefresh: Boolean) =
        cachedList(moviesSlot, forceRefresh, Actions.VOD_STREAMS, XtreamParsers::parseMovie) { it.streamId }

    override suspend fun seriesCategories(forceRefresh: Boolean) =
        cachedList(seriesCategoriesSlot, forceRefresh, Actions.SERIES_CATEGORIES, XtreamParsers::parseCategory) { it.id }

    override suspend fun series(forceRefresh: Boolean) =
        cachedList(seriesSlot, forceRefresh, Actions.SERIES, XtreamParsers::parseSeries) { it.seriesId }

    override suspend fun movieDetails(movieId: Long): DataResult<MovieDetails> {
        val credentials = credentialsProvider() ?: return DataResult.Failure(AppError.NotLoggedIn)
        val key = "${ownerKey(credentials)}#$movieId"
        movieDetailsCache[key]?.let { return DataResult.Success(it) }
        val cachedMovie = cachedMovie(movieId)
        val result = fetchElement(credentials, Actions.VOD_INFO, mapOf("vod_id" to movieId.toString()))
        return when (result) {
            is DataResult.Success -> {
                val details = XtreamParsers.parseMovieDetails(result.data, movieId, cachedMovie)
                if (details == null) DataResult.Failure(AppError.NotFound)
                else DataResult.Success(details).also { movieDetailsCache[key] = details }
            }
            // A missing info endpoint should not block playback of a movie we already know.
            is DataResult.Failure -> cachedMovie?.let { movie ->
                XtreamParsers.parseMovieDetails(null, movieId, movie)?.let { DataResult.Success(it) }
            } ?: result
        }
    }

    override suspend fun seriesDetails(seriesId: Long, forceRefresh: Boolean): DataResult<SeriesDetails> {
        val credentials = credentialsProvider() ?: return DataResult.Failure(AppError.NotLoggedIn)
        val key = "${ownerKey(credentials)}#$seriesId"
        if (!forceRefresh) seriesDetailsCache[key]?.let { return DataResult.Success(it) }
        val cachedSeries = seriesSlot.peek(ownerKey(credentials))?.firstOrNull { it.seriesId == seriesId }
        return when (val result = fetchElement(credentials, Actions.SERIES_INFO, mapOf("series_id" to seriesId.toString()))) {
            is DataResult.Success -> {
                val details = XtreamParsers.parseSeriesDetails(result.data, seriesId, cachedSeries)
                if (details == null) DataResult.Failure(AppError.NotFound)
                else DataResult.Success(details).also { seriesDetailsCache[key] = details }
            }
            is DataResult.Failure -> result
        }
    }

    override fun cachedLiveChannels(): List<LiveChannel>? =
        credentialsProvider()?.let { liveChannelsSlot.peek(ownerKey(it)) }

    override fun cachedMovie(movieId: Long): Movie? =
        credentialsProvider()?.let { c -> moviesSlot.peek(ownerKey(c))?.firstOrNull { it.streamId == movieId } }

    override fun clearCache() {
        listOf(liveCategoriesSlot, liveChannelsSlot, movieCategoriesSlot, moviesSlot, seriesCategoriesSlot, seriesSlot)
            .forEach { it.clear() }
        movieDetailsCache.clear()
        seriesDetailsCache.clear()
    }

    private suspend fun <T : Any> cachedList(
        slot: CacheSlot<List<T>>,
        forceRefresh: Boolean,
        action: String,
        transform: (JsonElement) -> T?,
        distinctKey: (T) -> Any
    ): DataResult<List<T>> {
        val credentials = credentialsProvider() ?: return DataResult.Failure(AppError.NotLoggedIn)
        return slot.get(ownerKey(credentials), forceRefresh) {
            safeCall {
                val response = service(credentials).action(credentials.username, credentials.password, action, emptyMap())
                val body = response.bodyOrError() ?: return@safeCall DataResult.Failure(httpError(response.code()))
                // Some panels repeat entries; duplicated ids would break list keys.
                DataResult.Success(body.use { reader.readList(it, transform) }.distinctBy(distinctKey))
            }
        }
    }

    private suspend fun fetchElement(
        credentials: Credentials,
        action: String,
        params: Map<String, String>
    ): DataResult<JsonElement?> = safeCall {
        val response = service(credentials).action(credentials.username, credentials.password, action, params)
        val body = response.bodyOrError() ?: return@safeCall DataResult.Failure(httpError(response.code()))
        DataResult.Success(body.use { reader.readElement(it) })
    }

    private fun service(credentials: Credentials): XtreamService = apiFactory.serviceFor(credentials.serverUrl)

    private fun ownerKey(credentials: Credentials) = "${credentials.serverUrl}|${credentials.username}"

    private fun Response<ResponseBody>.bodyOrError(): ResponseBody? {
        if (isSuccessful) return body()
        errorBody()?.close()
        return null
    }

    private fun httpError(code: Int): AppError = when (code) {
        401, 403 -> AppError.InvalidCredentials
        404 -> AppError.NotFound
        in 200..299 -> AppError.InvalidResponse
        else -> AppError.Http(code)
    }

    private suspend fun <T> safeCall(block: suspend () -> DataResult<T>): DataResult<T> = withContext(io) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            DataResult.Failure(mapException(e))
        }
    }

    companion object {
        private const val LIST_TTL = 4 * 60 * 60 * 1000L
        private const val DETAILS_CACHE_SIZE = 40

        fun mapException(e: Throwable): AppError = when (e) {
            is SocketTimeoutException -> AppError.Timeout
            is UnknownHostException, is ConnectException, is NoRouteToHostException, is SSLException ->
                AppError.ServerUnreachable
            is InterruptedIOException -> AppError.Timeout
            is IOException -> AppError.NoConnection
            is SerializationException, is InvalidXtreamResponseException, is IllegalArgumentException ->
                AppError.InvalidResponse
            else -> AppError.Unknown(e.javaClass.simpleName)
        }
    }
}
