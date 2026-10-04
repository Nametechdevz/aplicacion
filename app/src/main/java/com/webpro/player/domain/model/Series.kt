package com.webpro.player.domain.model

data class Series(
    val seriesId: Long,
    val name: String,
    val coverUrl: String?,
    val categoryId: String?,
    val plot: String?,
    val genre: String?,
    val releaseDate: String?,
    val rating: Double?,
    val year: String?
)

data class Season(
    val number: Int,
    val name: String,
    val coverUrl: String?,
    val episodeCount: Int
)

data class Episode(
    val id: Long,
    val seriesId: Long,
    val season: Int,
    val episodeNumber: Int,
    val title: String,
    val containerExtension: String?,
    val plot: String?,
    val durationSeconds: Long?,
    val durationLabel: String?,
    val imageUrl: String?
)

data class SeriesDetails(
    val series: Series,
    val backdropUrl: String?,
    val cast: String?,
    val director: String?,
    val seasons: List<Season>,
    val episodesBySeason: Map<Int, List<Episode>>
) {
    /** Every episode ordered by season and episode number. */
    val allEpisodes: List<Episode>
        get() = episodesBySeason.toSortedMap().values.flatten()
}
