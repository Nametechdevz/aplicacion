package com.webpro.player.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.usecase.FieldError
import com.webpro.player.domain.usecase.LoginResult
import com.webpro.player.domain.usecase.LoginUseCase
import com.webpro.player.ui.common.appContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
    val error: AppError? = null,
    val loggedIn: Boolean = false
)

class LoginViewModel(
    private val loginUseCase: LoginUseCase,
    private val sessionRepository: SessionRepository
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val prefill = sessionRepository.loginPrefill() ?: return@launch
            _state.update {
                if (it.server.isEmpty() && it.username.isEmpty()) {
                    it.copy(server = prefill.serverUrl, username = prefill.username, remember = prefill.remember)
                } else it
            }
        }
    }

    fun onServerChange(value: String) = _state.update { it.copy(server = value, serverError = null, error = null) }
    fun onUsernameChange(value: String) = _state.update { it.copy(username = value, usernameError = null, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, passwordError = null, error = null) }
    fun onRememberChange(value: Boolean) = _state.update { it.copy(remember = value) }
    fun togglePasswordVisibility() = _state.update { it.copy(passwordVisible = !it.passwordVisible) }

    fun connect() {
        val current = _state.value
        if (current.isLoading) return
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val result = loginUseCase(current.server, current.username, current.password, current.remember)
            _state.update { state ->
                when (result) {
                    is LoginResult.Success -> state.copy(isLoading = false, loggedIn = true, password = "")
                    is LoginResult.ValidationError -> state.copy(
                        isLoading = false,
                        serverError = result.serverError,
                        usernameError = result.usernameError,
                        passwordError = result.passwordError
                    )
                    is LoginResult.Failure -> state.copy(isLoading = false, error = result.error)
                }
            }
        }
    }

    fun onNavigated() = _state.update { it.copy(loggedIn = false) }

    companion object {
        val Factory = viewModelFactory {
            initializer {
                val c = appContainer()
                LoginViewModel(c.loginUseCase, c.sessionRepository)
            }
        }
    }
}
