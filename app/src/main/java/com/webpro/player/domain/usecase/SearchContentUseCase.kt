package com.webpro.player.domain.usecase

import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.SearchResults
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.utils.TextNormalizer
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

/**
 * Global search over channels, movies and series. Lists come from the repository
 * memory cache (downloaded once) and filtering runs off the main thread.
 */
class SearchContentUseCase(
    private val repository: XtreamRepository,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    data class Outcome(val results: SearchResults, val failedSections: Int)

    suspend operator fun invoke(query: String, limitPerSection: Int = DEFAULT_LIMIT): Outcome = coroutineScope {
        val normalizedQuery = TextNormalizer.normalize(query)
        if (normalizedQuery.length < MIN_QUERY_LENGTH) return@coroutineScope Outcome(SearchResults.EMPTY, 0)

        val channels = async { repository.liveChannels() }
        val movies = async { repository.movies() }
        val series = async { repository.series() }
        val c = channels.await()
        val m = movies.await()
        val s = series.await()
        val failed = listOf(c, m, s).count { it is DataResult.Failure }

        val results = withContext(dispatcher) {
            SearchResults(
                query = query,
                channels = filter(c.getOrNull().orEmpty(), normalizedQuery, limitPerSection) { it.name },
                movies = filter(m.getOrNull().orEmpty(), normalizedQuery, limitPerSection) { it.name },
                series = filter(s.getOrNull().orEmpty(), normalizedQuery, limitPerSection) { it.name }
            )
        }
        Outcome(results, failed)
    }

    private suspend fun <T> filter(items: List<T>, query: String, limit: Int, name: (T) -> String): List<T> {
        val exact = ArrayList<T>()
        val partial = ArrayList<T>()
        for ((index, item) in items.withIndex()) {
            if (index % 2000 == 0) coroutineContext.ensureActive()
            val normalized = TextNormalizer.normalize(name(item))
            if (!TextNormalizer.matches(normalized, query)) continue
            if (normalized.startsWith(query)) exact += item else partial += item
            if (exact.size >= limit) break
        }
        return (exact + partial).take(limit)
    }

    companion object {
        const val MIN_QUERY_LENGTH = 2
        const val DEFAULT_LIMIT = 60
    }
}
