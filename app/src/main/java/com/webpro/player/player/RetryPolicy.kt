package com.webpro.player.player

/**
 * Bounded exponential backoff: 500 ms, 1 s, 2 s, 4 s and then give up.
 * There is never an infinite reconnection loop.
 */
class RetryPolicy(val delaysMs: List<Long> = DEFAULT_DELAYS) {

    val maxAttempts: Int get() = delaysMs.size

    /** Delay before retry number [attempt] (1-based), or null when attempts are exhausted. */
    fun delayForAttempt(attempt: Int): Long? = if (attempt < 1) null else delaysMs.getOrNull(attempt - 1)

    companion object {
        val DEFAULT_DELAYS = listOf(500L, 1_000L, 2_000L, 4_000L)
    }
}
