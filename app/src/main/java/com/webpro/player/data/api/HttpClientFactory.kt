package com.webpro.player.data.api

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

object HttpClientFactory {

    const val USER_AGENT = "WEBPRO PLAYER/1.0 (Linux; Android) ExoPlayer"

    /** Client for API calls. No logging interceptor: URLs contain credentials. */
    fun createApiClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .followRedirects(true)
        .followSslRedirects(true)
        .addInterceptor(userAgentInterceptor())
        .build()

    /** Client for media streams; shares the connection pool with [base]. */
    fun createPlayerClient(base: OkHttpClient): OkHttpClient = base.newBuilder()
        .connectTimeout(12, TimeUnit.SECONDS)
        // Generous read timeout: on slow links a segment can take a while to arrive.
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun userAgentInterceptor() = Interceptor { chain ->
        val request = chain.request()
        if (request.header("User-Agent") != null) chain.proceed(request)
        else chain.proceed(request.newBuilder().header("User-Agent", USER_AGENT).build())
    }
}
