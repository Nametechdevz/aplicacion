package com.webpro.player.domain.model

data class Movie(
    val streamId: Long,
    val name: String,
    val posterUrl: String?,
    val categoryId: String?,
    val containerExtension: String?,
    val rating: Double?,
    val year: String?,
    val addedEpochSeconds: Long?
)

data class MovieDetails(
    val movie: Movie,
    val plot: String?,
    val genre: String?,
    val durationLabel: String?,
    val durationSeconds: Long?,
    val releaseDate: String?,
    val director: String?,
    val cast: String?,
    val backdropUrl: String?,
    val trailerYoutubeId: String?
) {
    val year: String?
        get() = movie.year ?: releaseDate?.let { YEAR_REGEX.find(it)?.value }

    private companion object {
        val YEAR_REGEX = Regex("(19|20)\\d{2}")
    }
}
