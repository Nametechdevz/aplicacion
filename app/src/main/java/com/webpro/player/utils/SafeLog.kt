package com.webpro.player.utils

import android.util.Log
import com.webpro.player.BuildConfig

/**
 * Logging facade that only writes debug/warning logs in debug builds and always
 * redacts credentials (query parameters and Xtream stream paths).
 */
object SafeLog {
    private const val TAG = "WebProPlayer"

    fun d(message: String) {
        if (BuildConfig.DEBUG) Log.d(TAG, LogRedactor.redact(message))
    }

    fun w(message: String, error: Throwable? = null) {
        if (BuildConfig.DEBUG) Log.w(TAG, LogRedactor.redact(message) + describe(error))
    }

    fun e(message: String, error: Throwable? = null) {
        Log.e(TAG, LogRedactor.redact(message) + describe(error))
    }

    private fun describe(error: Throwable?): String =
        error?.let { " (${it.javaClass.simpleName})" } ?: ""
}
