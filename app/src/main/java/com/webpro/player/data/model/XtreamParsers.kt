package com.webpro.player.data.model

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.Season
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.utils.TimeFormat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Result of parsing the authentication response. */
sealed class AuthParseResult {
    data class Authenticated(val account: AccountInfo) : AuthParseResult()
    data object InvalidCredentials : AuthParseResult()
    data object NotXtream : AuthParseResult()
}

/** Converts raw Xtream JSON into domain models, skipping malformed entries. */
object XtreamParsers {

    private val yearInName = Regex("[(\\[]((19|20)\\d{2})[)\\]]")
    private val yearAnywhere = Regex("(19|20)\\d{2}")

    fun parseAuth(root: JsonElement?, username: String): AuthParseResult {
        if (root is JsonArray) {
            // Many panels answer `[]` for unknown users.
            return if (root.isEmpty()) AuthParseResult.InvalidCredentials else AuthParseResult.NotXtream
        }
        val obj = root.asObject() ?: return AuthParseResult.NotXtream
        val userInfo = obj["user_info"].asObject()
            ?: return if (obj.containsKey("server_info")) AuthParseResult.InvalidCredentials else AuthParseResult.NotXtream
        val auth = userInfo.string("auth")
        if (auth == "0" || auth.equals("false", ignoreCase = true)) return AuthParseResult.InvalidCredentials
        if (auth == null && userInfo.string("username", "status") == null) return AuthParseResult.InvalidCredentials

        val serverInfo = obj["server_info"].asObject()
        return AuthParseResult.Authenticated(
            AccountInfo(
                username = userInfo.string("username") ?: username,
                status = userInfo.string("status"),
                expirationEpochSeconds = userInfo.long("exp_date")?.takeIf { it > 0 },
                isTrial = userInfo.bool("is_trial"),
                activeConnections = userInfo.int("active_cons"),
                maxConnections = userInfo.int("max_connections"),
                allowedOutputFormats = userInfo.stringList("allowed_output_formats"),
                serverTimezone = serverInfo?.string("timezone")
            )
        )
    }

    fun parseCategory(element: JsonElement): Category? {
        val obj = element.asObject() ?: return null
        val id = obj.string("category_id", "id") ?: return null
        return Category(
            id = id,
            name = obj.string("category_name", "name") ?: "Sin nombre",
            parentId = obj.string("parent_id")?.takeIf { it != "0" }
        )
    }

    fun parseLiveChannel(element: JsonElement): LiveChannel? {
        val obj = element.asObject() ?: return null
        val id = obj.long("stream_id", "id")?.takeIf { it > 0 } ?: return null
        return LiveChannel(
            streamId = id,
            number = obj.int("num") ?: 0,
            name = obj.string("name", "title") ?: "Canal $id",
            logoUrl = obj.imageUrl("stream_icon", "logo"),
            categoryId = obj.string("category_id") ?: obj.stringList("category_ids").firstOrNull(),
            epgChannelId = obj.string("epg_channel_id"),
            hasArchive = obj.bool("tv_archive")
        )
    }

    fun parseMovie(element: JsonElement): Movie? {
        val obj = element.asObject() ?: return null
        val id = obj.long("stream_id", "id")?.takeIf { it > 0 } ?: return null
        val name = obj.string("name", "title") ?: "Película $id"
        return Movie(
            streamId = id,
            name = name,
            posterUrl = obj.imageUrl("stream_icon", "cover", "movie_image"),
            categoryId = obj.string("category_id") ?: obj.stringList("category_ids").firstOrNull(),
            containerExtension = obj.string("container_extension"),
            rating = rating(obj),
            year = obj.string("year")?.let { yearAnywhere.find(it)?.value }
                ?: yearInName.find(name)?.groupValues?.get(1)
                ?: obj.string("releaseDate", "release_date", "releasedate")?.let { yearAnywhere.find(it)?.value },
            addedEpochSeconds = obj.long("added")
        )
    }

    fun parseSeries(element: JsonElement): Series? {
        val obj = element.asObject() ?: return null
        val id = obj.long("series_id", "id")?.takeIf { it > 0 } ?: return null
        val name = obj.string("name", "title") ?: "Serie $id"
        val release = obj.string("releaseDate", "release_date", "releasedate")
        return Series(
            seriesId = id,
            name = name,
            coverUrl = obj.imageUrl("cover", "stream_icon", "cover_big"),
            categoryId = obj.string("category_id") ?: obj.stringList("category_ids").firstOrNull(),
            plot = obj.string("plot", "description"),
            genre = obj.string("genre"),
            releaseDate = release,
            rating = rating(obj),
            year = obj.string("year")?.let { yearAnywhere.find(it)?.value }
                ?: release?.let { yearAnywhere.find(it)?.value }
                ?: yearInName.find(name)?.groupValues?.get(1)
        )
    }

    fun parseMovieDetails(root: JsonElement?, movieId: Long, cached: Movie?): MovieDetails? {
        val obj = root.asObject() ?: return cached?.let { emptyDetails(it) }
        val info = obj["info"].asObject() ?: JsonObject(emptyMap())
        val data = obj["movie_data"].asObject() ?: JsonObject(emptyMap())
        if (info.isEmpty() && data.isEmpty() && cached == null) return null

        val name = data.string("name") ?: info.string("name", "o_name", "title") ?: cached?.name ?: "Película $movieId"
        val release = info.string("releasedate", "release_date", "releaseDate")
        val movie = Movie(
            streamId = data.long("stream_id")?.takeIf { it > 0 } ?: movieId,
            name = name,
            posterUrl = info.imageUrl("movie_image", "cover_big", "cover") ?: cached?.posterUrl,
            categoryId = data.string("category_id") ?: cached?.categoryId,
            containerExtension = data.string("container_extension") ?: cached?.containerExtension,
            rating = rating(info) ?: cached?.rating,
            year = cached?.year ?: release?.let { yearAnywhere.find(it)?.value } ?: yearInName.find(name)?.groupValues?.get(1),
            addedEpochSeconds = data.long("added") ?: cached?.addedEpochSeconds
        )
        val durationSeconds = info.long("duration_secs")?.takeIf { it > 0 }
            ?: TimeFormat.parseDurationToSeconds(info.string("duration", "episode_run_time"))
        return MovieDetails(
            movie = movie,
            plot = info.string("plot", "description"),
            genre = info.string("genre"),
            durationLabel = durationSeconds?.let { TimeFormat.humanDuration(it) },
            durationSeconds = durationSeconds,
            releaseDate = release,
            director = info.string("director"),
            cast = info.string("cast", "actors"),
            backdropUrl = info.imageUrl("backdrop_path", "backdrop"),
            trailerYoutubeId = info.string("youtube_trailer")
        )
    }

    fun parseSeriesDetails(root: JsonElement?, seriesId: Long, cached: Series?): SeriesDetails? {
        val obj = root.asObject() ?: return null
        val info = obj["info"].asObject() ?: JsonObject(emptyMap())

        val episodes = parseEpisodes(obj["episodes"], seriesId)
        if (episodes.isEmpty() && info.isEmpty() && cached == null) return null

        val seasonMeta = obj["seasons"].asArrayOrValues().mapNotNull { it.asObject() }
            .mapNotNull { season ->
                val number = season.int("season_number", "season") ?: return@mapNotNull null
                number to season
            }.toMap()

        val bySeason = episodes.groupBy { it.season }
            .mapValues { (_, list) -> list.sortedWith(compareBy({ it.episodeNumber }, { it.id })) }
            .toSortedMap()

        val seasons = bySeason.map { (number, list) ->
            val meta = seasonMeta[number]
            Season(
                number = number,
                name = meta?.string("name")?.takeUnless { it.isBlank() } ?: "Temporada $number",
                coverUrl = meta?.imageUrl("cover_big", "cover"),
                episodeCount = list.size
            )
        }

        val name = info.string("name", "title") ?: cached?.name ?: "Serie $seriesId"
        val release = info.string("releaseDate", "release_date", "releasedate") ?: cached?.releaseDate
        val series = Series(
            seriesId = seriesId,
            name = name,
            coverUrl = info.imageUrl("cover", "cover_big") ?: cached?.coverUrl,
            categoryId = info.string("category_id") ?: cached?.categoryId,
            plot = info.string("plot", "description") ?: cached?.plot,
            genre = info.string("genre") ?: cached?.genre,
            releaseDate = release,
            rating = rating(info) ?: cached?.rating,
            year = cached?.year ?: release?.let { yearAnywhere.find(it)?.value }
        )
        return SeriesDetails(
            series = series,
            backdropUrl = info.imageUrl("backdrop_path", "backdrop"),
            cast = info.string("cast", "actors"),
            director = info.string("director"),
            seasons = seasons,
            episodesBySeason = bySeason
        )
    }

    /** Supports `{"1":[...],"2":[...]}`, `[[...],[...]]` and a flat `[...]` list. */
    private fun parseEpisodes(element: JsonElement?, seriesId: Long): List<Episode> {
        val result = ArrayList<Episode>()
        when (element) {
            is JsonObject -> element.forEach { (seasonKey, value) ->
                val fallbackSeason = seasonKey.trim().toIntOrNull()
                value.asArrayOrValues().forEach { e -> parseEpisode(e, seriesId, fallbackSeason)?.let(result::add) }
            }
            is JsonArray -> element.forEach { item ->
                if (item is JsonArray) item.forEach { e -> parseEpisode(e, seriesId, null)?.let(result::add) }
                else parseEpisode(item, seriesId, null)?.let(result::add)
            }
            else -> Unit
        }
        return result.distinctBy { it.id }
    }

    private fun parseEpisode(element: JsonElement, seriesId: Long, fallbackSeason: Int?): Episode? {
        val obj = element.asObject() ?: return null
        val id = obj.long("id", "stream_id")?.takeIf { it > 0 } ?: return null
        val info = obj["info"].asObject() ?: JsonObject(emptyMap())
        val season = obj.int("season") ?: info.int("season") ?: fallbackSeason ?: 1
        val number = obj.int("episode_num", "episode") ?: 0
        val duration = info.long("duration_secs")?.takeIf { it > 0 }
            ?: TimeFormat.parseDurationToSeconds(info.string("duration"))
        return Episode(
            id = id,
            seriesId = seriesId,
            season = season,
            episodeNumber = number,
            title = obj.string("title", "name") ?: "Episodio $number",
            containerExtension = obj.string("container_extension"),
            plot = info.string("plot", "description"),
            durationSeconds = duration,
            durationLabel = duration?.let { TimeFormat.humanDuration(it) },
            imageUrl = info.imageUrl("movie_image", "cover_big", "cover")
        )
    }

    private fun rating(obj: JsonObject): Double? {
        val ten = obj.double("rating")?.takeIf { it > 0 && it <= 10 }
        if (ten != null) return ten
        return obj.double("rating_5based")?.takeIf { it > 0 && it <= 5 }?.let { it * 2 }
    }

    private fun emptyDetails(movie: Movie) = MovieDetails(
        movie = movie, plot = null, genre = null, durationLabel = null, durationSeconds = null,
        releaseDate = null, director = null, cast = null, backdropUrl = null, trailerYoutubeId = null
    )
}
