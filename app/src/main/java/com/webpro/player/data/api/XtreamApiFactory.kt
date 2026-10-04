package com.webpro.player.data.api

import com.webpro.player.utils.UrlNormalizer
import okhttp3.OkHttpClient
import retrofit2.Retrofit

/** Creates (and reuses) the Retrofit service for the server chosen by the user. */
class XtreamApiFactory(private val client: OkHttpClient) {

    private var cachedBaseUrl: String? = null
    private var cachedService: XtreamService? = null

    @Synchronized
    fun serviceFor(baseUrl: String): XtreamService {
        val apiBase = UrlNormalizer.apiBase(baseUrl)
        val current = cachedService
        if (current != null && cachedBaseUrl == apiBase) return current
        val service = Retrofit.Builder()
            .baseUrl(apiBase)
            .client(client)
            .build()
            .create(XtreamService::class.java)
        cachedBaseUrl = apiBase
        cachedService = service
        return service
    }
}
