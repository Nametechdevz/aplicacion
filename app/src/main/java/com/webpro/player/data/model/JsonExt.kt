package com.webpro.player.data.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Tolerant accessors for Xtream JSON. Servers send numbers as strings (and vice versa),
 * empty strings, "null", arrays where objects are expected, etc. None of these throw.
 */

internal fun JsonElement?.asObject(): JsonObject? = this as? JsonObject

internal fun JsonElement?.asArrayOrValues(): List<JsonElement> = when (this) {
    is JsonArray -> this
    is JsonObject -> this.values.toList()
    else -> emptyList()
}

internal fun JsonElement?.primitiveContent(): String? {
    val primitive = this as? JsonPrimitive ?: return null
    if (primitive is JsonNull) return null
    val content = primitive.content.trim()
    return content.takeIf { it.isNotEmpty() && !it.equals("null", ignoreCase = true) }
}

internal fun JsonObject.string(vararg keys: String): String? {
    for (key in keys) {
        val value = this[key].primitiveContent()
        if (value != null) return value
    }
    return null
}

internal fun JsonObject.long(vararg keys: String): Long? {
    for (key in keys) {
        val text = this[key].primitiveContent() ?: continue
        val value = text.toLongOrNull() ?: text.replace(',', '.').toDoubleOrNull()?.toLong()
        if (value != null) return value
    }
    return null
}

internal fun JsonObject.int(vararg keys: String): Int? = long(*keys)?.let {
    if (it in Int.MIN_VALUE..Int.MAX_VALUE) it.toInt() else null
}

internal fun JsonObject.double(vararg keys: String): Double? {
    for (key in keys) {
        val value = this[key].primitiveContent()?.replace(',', '.')?.toDoubleOrNull()
        if (value != null && !value.isNaN()) return value
    }
    return null
}

internal fun JsonObject.bool(vararg keys: String): Boolean {
    for (key in keys) {
        val text = this[key].primitiveContent()?.lowercase() ?: continue
        return text == "1" || text == "true" || text == "yes"
    }
    return false
}

/** Accepts `["a","b"]`, `"a,b"` or a single primitive. */
internal fun JsonObject.stringList(key: String): List<String> = when (val value = this[key]) {
    is JsonArray -> value.mapNotNull { it.primitiveContent() }
    is JsonPrimitive -> value.primitiveContent()?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
    else -> emptyList()
}

/** Accepts a URL string or an array of URL strings and returns the first valid URL. */
internal fun JsonObject.imageUrl(vararg keys: String): String? {
    for (key in keys) {
        val candidate = when (val value = this[key]) {
            is JsonArray -> value.firstNotNullOfOrNull { it.primitiveContent() }
            else -> value.primitiveContent()
        }
        if (candidate != null && (candidate.startsWith("http://", true) || candidate.startsWith("https://", true))) {
            return candidate
        }
    }
    return null
}
