package com.webpro.player.domain.model

data class SearchResults(
    val query: String,
    val channels: List<LiveChannel>,
    val movies: List<Movie>,
    val series: List<Series>
) {
    val isEmpty: Boolean get() = channels.isEmpty() && movies.isEmpty() && series.isEmpty()

    companion object {
        val EMPTY = SearchResults("", emptyList(), emptyList(), emptyList())
    }
}
