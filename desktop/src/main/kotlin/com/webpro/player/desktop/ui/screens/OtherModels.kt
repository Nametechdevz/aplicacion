package com.webpro.player.desktop.ui.screens

import com.webpro.player.desktop.DesktopContainer
import com.webpro.player.desktop.ui.ScreenModel
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.ContentType
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.Episode
import com.webpro.player.domain.model.FavoriteItem
import com.webpro.player.domain.model.LiveChannel
import com.webpro.player.domain.model.MovieDetails
import com.webpro.player.domain.model.ResumePoint
import com.webpro.player.domain.model.SearchResults
import com.webpro.player.domain.model.SeriesDetails
import com.webpro.player.domain.usecase.FieldError
import com.webpro.player.domain.usecase.LoginResult
import com.webpro.player.domain.usecase.SearchContentUseCase
import com.webpro.player.ui.common.UiState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ------------------------------------------------------------------ login

data class LoginUiState(
    val server: String = "",
    val username: String = "",
    val password: String = "",
    val remember: Boolean = true,
    val passwordVisible: Boolean = false,
    val isLoading: Boolean = false,
    val serverError: FieldError? = null,
    val usernameError: FieldError? = null,
    val passwordError: FieldError? = null,
    val error: AppError? = null
)

class LoginModel(private val c: DesktopContainer, private val onLoggedIn: () -> Unit) : ScreenModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        scope.launch {
            val prefill = c.sessionRepository.loginPrefill() ?: return@launch
            _state.update { if (it.server.isEmpty()) it.copy(server = prefill.serverUrl, username = prefill.username, remember = prefill.remember) else it }
        }
    }

    fun onServer(v: String) = _state.update { it.copy(server = v, serverError = null, error = null) }
    fun onUser(v: String) = _state.update { it.copy(username = v, usernameError = null, error = null) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, passwordError = null, error = null) }
    fun onRemember(v: Boolean) = _state.update { it.copy(remember = v) }
    fun togglePassword() = _state.update { it.copy(passwordVisible = !it.passwordVisible) }

    fun connect() {
        val s = _state.value
        if (s.isLoading) return
        _state.update { it.copy(isLoading = true, error = null) }
        scope.launch {
            when (val result = c.loginUseCase(s.server, s.username, s.password, s.remember)) {
                is LoginResult.Success -> {
                    _state.update { it.copy(isLoading = false, password = "") }
                    onLoggedIn()
                }
                is LoginResult.ValidationError -> _state.update {
                    it.copy(isLoading = false, serverError = result.serverError, usernameError = result.usernameError, passwordError = result.passwordError)
                }
                is LoginResult.Failure -> _state.update { it.copy(isLoading = false, error = result.error) }
            }
        }
    }
}

// ------------------------------------------------------------------ details

class MovieDetailModel(private val c: DesktopContainer, val movieId: Long) : ScreenModel() {
    private val _state = MutableStateFlow<UiState<MovieDetails>>(UiState.Loading)
    val state: StateFlow<UiState<MovieDetails>> = _state.asStateFlow()
    val isFavorite = c.favoritesRepository.favoriteKeys().map { FavoriteItem.keyOf(ContentType.MOVIE, movieId) in it }
        .stateIn(scope, SharingStarted.Eagerly, false)
    val resume = c.historyRepository.resumePoints.map { it[ResumePoint.keyOf(ContentType.MOVIE, movieId)] }
        .stateIn(scope, SharingStarted.Eagerly, null)

    init { load() }

    fun load() {
        scope.launch {
            _state.value = UiState.Loading
            _state.value = when (val r = c.xtreamRepository.movieDetails(movieId)) {
                is DataResult.Success -> UiState.Success(r.data)
                is DataResult.Failure -> UiState.Error(r.error)
            }
        }
    }

    fun toggleFavorite() {
        val m = (_state.value as? UiState.Success)?.data?.movie ?: return
        scope.launch {
            c.favoritesRepository.toggle(FavoriteItem(ContentType.MOVIE, m.streamId, m.name, m.posterUrl, m.categoryId, m.containerExtension))
        }
    }
}

class SeriesDetailModel(private val c: DesktopContainer, val seriesId: Long) : ScreenModel() {
    private val _state = MutableStateFlow<UiState<SeriesDetails>>(UiState.Loading)
    val state: StateFlow<UiState<SeriesDetails>> = _state.asStateFlow()
    private val _season = MutableStateFlow<Int?>(null)
    val selectedSeason: StateFlow<Int?> = _season.asStateFlow()
    val isFavorite = c.favoritesRepository.favoriteKeys().map { FavoriteItem.keyOf(ContentType.SERIES, seriesId) in it }
        .stateIn(scope, SharingStarted.Eagerly, false)
    val lastWatched = c.historyRepository.lastEpisodeOfSeries(seriesId).stateIn(scope, SharingStarted.Eagerly, null)
    val resumePoints = c.historyRepository.resumePoints.stateIn(scope, SharingStarted.Eagerly, emptyMap())

    init { load(false) }

    fun load(force: Boolean = true) {
        scope.launch {
            _state.value = UiState.Loading
            _state.value = when (val r = c.xtreamRepository.seriesDetails(seriesId, force)) {
                is DataResult.Success -> {
                    val d = r.data
                    if (_season.value == null || d.seasons.none { it.number == _season.value }) {
                        val last = lastWatched.value?.season
                        _season.value = d.seasons.firstOrNull { it.number == last }?.number ?: d.seasons.firstOrNull()?.number
                    }
                    UiState.Success(d)
                }
                is DataResult.Failure -> UiState.Error(r.error)
            }
        }
    }

    fun selectSeason(n: Int) { _season.value = n }

    fun continueEpisode(d: SeriesDetails): Episode? {
        val all = d.allEpisodes
        return lastWatched.value?.let { p -> all.firstOrNull { it.id == p.id } } ?: all.firstOrNull()
    }

    fun toggleFavorite() {
        val s = (_state.value as? UiState.Success)?.data?.series ?: return
        scope.launch { c.favoritesRepository.toggle(FavoriteItem(ContentType.SERIES, s.seriesId, s.name, s.coverUrl, s.categoryId)) }
    }
}

// ------------------------------------------------------------------ search

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
class SearchModel(private val c: DesktopContainer) : ScreenModel() {
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()
    val favoriteKeys = c.favoritesRepository.favoriteKeys().stateIn(scope, SharingStarted.Eagerly, emptySet())

    /** null = waiting for input. */
    val state: StateFlow<UiState<SearchResults>?> = _query.map { it.trim() }.debounce(300).distinctUntilChanged()
        .flatMapLatest { text ->
            flow<UiState<SearchResults>?> {
                if (text.length < SearchContentUseCase.MIN_QUERY_LENGTH) { emit(null); return@flow }
                emit(UiState.Loading)
                val outcome = c.searchUseCase(text)
                emit(
                    when {
                        outcome.failedSections == 3 -> UiState.Error(AppError.ServerUnreachable)
                        outcome.results.isEmpty -> UiState.Empty
                        else -> UiState.Success(outcome.results)
                    }
                )
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, null)

    fun onQuery(v: String) { _query.value = v }

    fun toggleFavorite(ch: LiveChannel) {
        scope.launch { c.favoritesRepository.toggle(FavoriteItem(ContentType.LIVE, ch.streamId, ch.name, ch.logoUrl, ch.categoryId)) }
    }
}

// ------------------------------------------------------------------ settings

class SettingsModel(private val c: DesktopContainer, private val onLoggedOut: () -> Unit) : ScreenModel() {
    val session = c.sessionRepository.session
    val settings = c.settingsRepository.desktopSettings
    private var job: Job? = null

    fun setLiveFormat(f: com.webpro.player.domain.model.LiveStreamFormat) {
        scope.launch { c.settingsRepository.setLiveStreamFormat(f) }
    }
    fun setAutoplay(v: Boolean) { scope.launch { c.settingsRepository.setAutoPlayNextEpisode(v) } }
    fun setHardware(v: Boolean) {
        scope.launch {
            c.settingsRepository.setHardwareDecoding(v)
            c.playerManager.invalidateEngine()
        }
    }
    fun setBuffer(ms: Int) { scope.launch { c.settingsRepository.setNetworkCaching(ms) } }

    fun logout() {
        job = scope.launch {
            c.sessionRepository.logout()
            c.xtreamRepository.clearCache()
            onLoggedOut()
        }
    }

    fun deleteAll() {
        job = scope.launch {
            c.sessionRepository.clearAll()
            c.favoritesRepository.clear()
            c.historyRepository.clear()
            c.settingsRepository.clear()
            c.xtreamRepository.clearCache()
            onLoggedOut()
        }
    }
}
