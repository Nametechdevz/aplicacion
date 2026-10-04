package com.webpro.player.data.api

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.DecodeSequenceMode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeToSequence
import okhttp3.ResponseBody
import java.io.BufferedInputStream

/**
 * Reads Xtream responses without loading huge catalogs (tens of MB) as a single
 * string. JSON arrays are decoded element by element; objects are parsed whole.
 */
class JsonResponseReader(private val json: Json) {

    /** Maps every element of a JSON list (array, or object of values) with [transform]. */
    @OptIn(ExperimentalSerializationApi::class)
    fun <T : Any> readList(body: ResponseBody, transform: (JsonElement) -> T?): List<T> {
        BufferedInputStream(body.byteStream(), BUFFER_SIZE).use { stream ->
            return when (peekFirstSignificantByte(stream)) {
                '['.code -> {
                    val out = ArrayList<T>()
                    json.decodeToSequence(stream, JsonElement.serializer(), DecodeSequenceMode.ARRAY_WRAPPED)
                        .forEach { element -> transform(element)?.let(out::add) }
                    out
                }
                '{'.code -> {
                    val root = json.parseToJsonElement(stream.readBytes().decodeToString())
                    (root as? JsonObject)?.values?.mapNotNull(transform).orEmpty()
                }
                -1 -> emptyList()
                else -> throw InvalidXtreamResponseException()
            }
        }
    }

    /** Parses a whole JSON document. Returns null for an empty body. */
    fun readElement(body: ResponseBody): JsonElement? {
        val text = body.string().trim().removePrefix("﻿")
        if (text.isEmpty()) return null
        if (text.first() != '{' && text.first() != '[') throw InvalidXtreamResponseException()
        return json.parseToJsonElement(text)
    }

    private fun peekFirstSignificantByte(stream: BufferedInputStream): Int {
        while (true) {
            stream.mark(4)
            val b = stream.read()
            if (b == -1) return -1
            // Skip whitespace and a UTF-8 BOM (EF BB BF).
            if (b == 0xEF) {
                stream.read(); stream.read()
                continue
            }
            if (b.toChar().isWhitespace()) continue
            stream.reset()
            return b
        }
    }

    private companion object {
        const val BUFFER_SIZE = 64 * 1024
    }
}

/** The server answered with something that is not Xtream JSON (HTML page, plain text...). */
class InvalidXtreamResponseException : RuntimeException("Unexpected response format")
