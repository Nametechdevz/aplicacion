package com.webpro.player.domain

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Category
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.Movie
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.Series
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.LoginPrefill
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.domain.usecase.FieldError
import com.webpro.player.domain.usecase.LoginResult
import com.webpro.player.domain.usecase.LoginUseCase
import com.webpro.player.domain.usecase.SearchContentUseCase
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private fun account(status: String? = "Active") =
    AccountInfo("juan", status, null, false, 0, 1, listOf("m3u8"), null)

private class FakeXtream(
    var authResult: DataResult<AccountInfo> = DataResult.Success(account()),
    var channels: DataResult<List<LiveChannel>> = DataResult.Success(emptyList()),
    var moviesList: DataResult<List<Movie>> = DataResult.Success(emptyList()),
    var seriesList: DataResult<List<Series>> = DataResult.Success(emptyList())
) : XtreamRepository {
    var lastCredentials: Credentials? = null
    var cleared = false
    override suspend fun authenticate(credentials: Credentials): DataResult<AccountInfo> {
        lastCredentials = credentials
        return authResult
    }
    override suspend fun liveCategories(forceRefresh: Boolean): DataResult<List<Category>> = DataResult.Success(emptyList())
    override suspend fun liveChannels(forceRefresh: Boolean) = channels
    override suspend fun movieCategories(forceRefresh: Boolean): DataResult<List<Category>> = DataResult.Success(emptyList())
    override suspend fun movies(forceRefresh: Boolean) = moviesList
    override suspend fun movieDetails(movieId: Long): DataResult<MovieDetails> = DataResult.Failure(AppError.NotFound)
    override suspend fun seriesCategories(forceRefresh: Boolean): DataResult<List<Category>> = DataResult.Success(emptyList())
    override suspend fun series(forceRefresh: Boolean) = seriesList
    override suspend fun seriesDetails(seriesId: Long, forceRefresh: Boolean): DataResult<SeriesDetails> =
        DataResult.Failure(AppError.NotFound)
    override fun cachedLiveChannels(): List<LiveChannel>? = null
    override fun cachedMovie(movieId: Long): Movie? = null
    override fun clearCache() {
        cleared = true
    }
}

private class FakeSession : SessionRepository {
    private val state = MutableStateFlow<Session?>(null)
    override val session: StateFlow<Session?> = state
    override suspend fun restore() = state.value != null
    override suspend fun saveSession(session: Session) {
        state.value = session
    }
    override suspend fun updateAccount(account: AccountInfo) = Unit
    override suspend fun loginPrefill(): LoginPrefill? = null
    override suspend fun logout() {
        state.value = null
    }
    override suspend fun clearAll() {
        state.value = null
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class UseCasesTest {

    @Test
    fun `login validates fields before calling the server`() = runTest {
        val xtream = FakeXtream()
        val result = LoginUseCase(xtream, FakeSession())("", " ", "", remember = true)
        assertEquals(
            LoginResult.ValidationError(FieldError.REQUIRED, FieldError.REQUIRED, FieldError.REQUIRED),
            result
        )
        assertNull(xtream.lastCredentials)
    }

    @Test
    fun `login rejects unsupported url`() = runTest {
        val result = LoginUseCase(FakeXtream(), FakeSession())("ftp://x.com", "a", "b", true)
        assertEquals(FieldError.UNSUPPORTED_SCHEME, (result as LoginResult.ValidationError).serverError)
    }

    @Test
    fun `login normalizes url and stores session`() = runTest {
        val xtream = FakeXtream()
        val session = FakeSession()
        val result = LoginUseCase(xtream, session)("servidor.com:8080/", " juan ", "clave", remember = false)
        assertTrue(result is LoginResult.Success)
        assertEquals(Credentials("http://servidor.com:8080", "juan", "clave"), xtream.lastCredentials)
        assertEquals(false, session.session.value!!.remember)
        assertTrue(xtream.cleared)
    }

    @Test
    fun `login uses credentials embedded in pasted link`() = runTest {
        val xtream = FakeXtream()
        LoginUseCase(xtream, FakeSession())("http://s.com:80/get.php?username=ana&password=pw&type=m3u", "", "", true)
        assertEquals(Credentials("http://s.com", "ana", "pw"), xtream.lastCredentials)
    }

    @Test
    fun `login reports server errors and expired accounts`() = runTest {
        val failing = FakeXtream(authResult = DataResult.Failure(AppError.InvalidCredentials))
        assertEquals(
            LoginResult.Failure(AppError.InvalidCredentials),
            LoginUseCase(failing, FakeSession())("http://s.com", "a", "b", true)
        )
        val expired = FakeXtream(authResult = DataResult.Success(account(status = "Expired")))
        val session = FakeSession()
        assertEquals(LoginResult.Failure(AppError.AccountExpired), LoginUseCase(expired, session)("http://s.com", "a", "b", true))
        assertNull(session.session.value)
    }

    @Test
    fun `search matches accents, ranks prefix first and tolerates failures`() = runTest {
        val xtream = FakeXtream(
            channels = DataResult.Success(
                listOf(
                    LiveChannel(1, 1, "Canal Acción HD", null, null, null, false),
                    LiveChannel(2, 2, "Acción Plus", null, null, null, false),
                    LiveChannel(3, 3, "Noticias", null, null, null, false)
                )
            ),
            moviesList = DataResult.Failure(AppError.Timeout)
        )
        val outcome = SearchContentUseCase(xtream, UnconfinedTestDispatcher(testScheduler))("accion")
        assertEquals(listOf(2L, 1L), outcome.results.channels.map { it.streamId })
        assertTrue(outcome.results.movies.isEmpty())
        assertEquals(1, outcome.failedSections)
    }

    @Test
    fun `search ignores too short queries`() = runTest {
        val outcome = SearchContentUseCase(FakeXtream())("a")
        assertTrue(outcome.results.isEmpty)
    }
}
