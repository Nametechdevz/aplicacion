package com.webpro.player.utils

import java.text.DateFormat
import java.util.Date
import java.util.Locale

object TimeFormat {

    /** 3723000 -> "1:02:03", 83000 -> "01:23". */
    fun playback(ms: Long): String {
        val totalSeconds = (ms.coerceAtLeast(0L) / 1000L)
        val h = totalSeconds / 3600
        val m = (totalSeconds % 3600) / 60
        val s = totalSeconds % 60
        return if (h > 0) String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s)
        else String.format(Locale.ROOT, "%02d:%02d", m, s)
    }

    /** 6300 -> "1 h 45 min", 2700 -> "45 min". */
    fun humanDuration(seconds: Long): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        return when {
            h > 0 && m > 0 -> "$h h $m min"
            h > 0 -> "$h h"
            else -> "${m.coerceAtLeast(1)} min"
        }
    }

    /** Parses "01:45:00", "45:00" or "105" (minutes) into seconds. */
    fun parseDurationToSeconds(value: String?): Long? {
        val text = value?.trim().orEmpty()
        if (text.isEmpty()) return null
        val parts = text.split(':')
        if (parts.size in 2..3 && parts.all { p -> p.isNotEmpty() && p.all { it.isDigit() } }) {
            val numbers = parts.map { it.toLong() }
            return if (numbers.size == 3) numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
            else numbers[0] * 60 + numbers[1]
        }
        val minutes = Regex("(\\d+)\\s*min").find(text)?.groupValues?.get(1)?.toLongOrNull()
        if (minutes != null) return minutes * 60
        return text.toLongOrNull()?.takeIf { it > 0 }?.let { it * 60 }
    }

    fun date(epochSeconds: Long, locale: Locale = Locale.getDefault()): String =
        DateFormat.getDateInstance(DateFormat.MEDIUM, locale).format(Date(epochSeconds * 1000L))
}
