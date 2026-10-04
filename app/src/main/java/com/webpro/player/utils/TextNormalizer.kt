package com.webpro.player.utils

import java.text.Normalizer
import java.util.Locale

object TextNormalizer {
    private val diacritics = Regex("\\p{Mn}+")
    private val spaces = Regex("\\s+")

    /** Lower-cases and removes accents so "Película" matches "pelicula". */
    fun normalize(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(diacritics, "")
            .lowercase(Locale.ROOT)
            .replace(spaces, " ")
            .trim()

    /** True when every word of [normalizedQuery] appears in [normalizedText]. */
    fun matches(normalizedText: String, normalizedQuery: String): Boolean {
        if (normalizedQuery.isEmpty()) return true
        return normalizedQuery.split(' ').all { normalizedText.contains(it) }
    }
}
