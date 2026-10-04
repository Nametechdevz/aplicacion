package com.webpro.player.utils

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Normalizes the server address typed by the user into a canonical base URL
 * (`scheme://host[:port][/path]`, without trailing slash).
 *
 * - adds `http://` when the scheme is missing,
 * - repairs common typos such as `http:/host`, `http//host` or `HTTP://`,
 * - removes trailing slashes, query strings and Xtream script names (`player_api.php`, `get.php`...),
 * - keeps explicit ports and sub paths of valid URLs untouched,
 * - extracts `username`/`password` when a full M3U/API link is pasted.
 */
object UrlNormalizer {

    sealed class Result {
        data class Valid(
            val baseUrl: String,
            val username: String? = null,
            val password: String? = null
        ) : Result() {
            override fun toString(): String =
                "Valid(baseUrl=$baseUrl, username=$username, password=${if (password == null) "null" else "***"})"
        }

        data class Invalid(val reason: Reason) : Result()
    }

    enum class Reason { EMPTY, UNSUPPORTED_SCHEME, MALFORMED }

    private val schemeTypo = Regex("^(https?)(:/*|/+)", RegexOption.IGNORE_CASE)
    private val otherScheme = Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://")
    private val scriptNames = setOf("player_api.php", "get.php", "panel_api.php", "xmltv.php", "portal.php")

    fun normalize(raw: String?): Result {
        var input = raw.orEmpty()
            .trim()
            .trim('"', '\'')
            .replace("\\", "/")
            .filterNot { it.isWhitespace() }
        if (input.isEmpty()) return Result.Invalid(Reason.EMPTY)

        val typo = schemeTypo.find(input)
        input = when {
            typo != null -> typo.groupValues[1].lowercase() + "://" + input.substring(typo.range.last + 1)
            otherScheme.containsMatchIn(input) -> return Result.Invalid(Reason.UNSUPPORTED_SCHEME)
            else -> "http://" + input.trimStart('/')
        }

        val parsed = input.toHttpUrlOrNull() ?: return Result.Invalid(Reason.MALFORMED)
        if (parsed.host.isBlank() || !isPlausibleHost(parsed.host)) return Result.Invalid(Reason.MALFORMED)

        val segments = parsed.pathSegments.filter { it.isNotEmpty() }.toMutableList()
        if (segments.isNotEmpty() && segments.last().lowercase() in scriptNames) {
            segments.removeAt(segments.lastIndex)
        }

        val builder = HttpUrl.Builder()
            .scheme(parsed.scheme)
            .host(parsed.host)
            .port(parsed.port)
        segments.forEach { builder.addPathSegment(it) }
        val base = builder.build().toString().trimEnd('/')

        return Result.Valid(
            baseUrl = base,
            username = parsed.queryParameter("username")?.takeIf { it.isNotBlank() },
            password = parsed.queryParameter("password")?.takeIf { it.isNotBlank() }
        )
    }

    /** Base URL with a trailing slash, as required by Retrofit. */
    fun apiBase(baseUrl: String): String = baseUrl.trimEnd('/') + "/"

    private fun isPlausibleHost(host: String): Boolean {
        if (host == "localhost") return true
        if (host.contains(':')) return true // IPv6 literal
        if (host.startsWith('.') || host.endsWith('.')) return false
        return host.contains('.') || host.all { it.isLetterOrDigit() || it == '-' }
    }
}
