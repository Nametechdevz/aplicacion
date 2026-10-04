package com.webpro.player.data.repository

import com.webpro.player.domain.model.DataResult
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A single cached value tied to an owner key (server + user). Concurrent callers
 * share one download thanks to the mutex: the second caller gets the cached result.
 */
internal class CacheSlot<T>(private val ttlMillis: Long, private val clock: () -> Long) {
    private class Entry<T>(val owner: String, val value: T, val storedAt: Long)

    private val mutex = Mutex()

    @Volatile
    private var entry: Entry<T>? = null

    fun peek(owner: String): T? = entry?.takeIf { it.owner == owner }?.value

    suspend fun get(owner: String, forceRefresh: Boolean, loader: suspend () -> DataResult<T>): DataResult<T> =
        mutex.withLock {
            val current = entry
            if (!forceRefresh && current != null && current.owner == owner && clock() - current.storedAt < ttlMillis) {
                return@withLock DataResult.Success(current.value)
            }
            val result = loader()
            if (result is DataResult.Success) entry = Entry(owner, result.data, clock())
            result
        }

    fun clear() {
        entry = null
    }
}

/** Small thread-safe LRU cache for detail screens. */
internal class LruCache<K, V>(private val maxSize: Int) {
    private val map = object : LinkedHashMap<K, V>(maxSize, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?): Boolean = size > maxSize
    }

    @Synchronized
    operator fun get(key: K): V? = map[key]

    @Synchronized
    operator fun set(key: K, value: V) {
        map[key] = value
    }

    @Synchronized
    fun clear() = map.clear()
}
