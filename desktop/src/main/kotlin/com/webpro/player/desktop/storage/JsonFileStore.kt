package com.webpro.player.desktop.storage

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * A small JSON document persisted atomically (write temp + move). The value is kept in
 * memory as a [StateFlow]; corrupted or missing files fall back to [default].
 */
class JsonFileStore<T>(
    private val file: File,
    private val serializer: KSerializer<T>,
    private val json: Json,
    private val default: T
) {
    private val mutex = Mutex()
    private val _data = MutableStateFlow(read())
    val data: StateFlow<T> = _data.asStateFlow()

    suspend fun update(transform: (T) -> T): T = mutex.withLock {
        val updated = transform(_data.value)
        withContext(Dispatchers.IO) { write(updated) }
        _data.value = updated
        updated
    }

    suspend fun clear() {
        mutex.withLock {
            withContext(Dispatchers.IO) { file.delete() }
            _data.value = default
        }
    }

    private fun read(): T = runCatching {
        if (!file.isFile) default else json.decodeFromString(serializer, file.readText(Charsets.UTF_8))
    }.getOrDefault(default)

    private fun write(value: T) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeText(json.encodeToString(serializer, value), Charsets.UTF_8)
        Files.move(tmp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    }
}
