package com.webpro.player.data.api

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query
import retrofit2.http.QueryMap
import retrofit2.http.Streaming

/**
 * Xtream Codes "player_api.php" endpoint. Bodies are returned raw and parsed by
 * tolerant parsers because servers differ in field names and types.
 */
interface XtreamService {

    /** Without action: returns `user_info` + `server_info` (authentication). */
    @GET("player_api.php")
    suspend fun authenticate(
        @Query("username") username: String,
        @Query("password") password: String
    ): Response<ResponseBody>

    @Streaming
    @GET("player_api.php")
    suspend fun action(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("action") action: String,
        @QueryMap params: Map<String, String>
    ): Response<ResponseBody>

    object Actions {
        const val LIVE_CATEGORIES = "get_live_categories"
        const val LIVE_STREAMS = "get_live_streams"
        const val VOD_CATEGORIES = "get_vod_categories"
        const val VOD_STREAMS = "get_vod_streams"
        const val VOD_INFO = "get_vod_info"
        const val SERIES_CATEGORIES = "get_series_categories"
        const val SERIES = "get_series"
        const val SERIES_INFO = "get_series_info"
    }
}
