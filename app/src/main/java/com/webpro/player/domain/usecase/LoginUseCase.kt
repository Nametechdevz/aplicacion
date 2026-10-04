package com.webpro.player.domain.usecase

import com.webpro.player.domain.model.AccountInfo
import com.webpro.player.domain.model.AppError
import com.webpro.player.domain.model.Credentials
import com.webpro.player.domain.model.DataResult
import com.webpro.player.domain.model.Session
import com.webpro.player.domain.repository.SessionRepository
import com.webpro.player.domain.repository.XtreamRepository
import com.webpro.player.utils.UrlNormalizer

sealed class LoginResult {
    data class Success(val account: AccountInfo) : LoginResult()
    data class ValidationError(
        val serverError: FieldError? = null,
        val usernameError: FieldError? = null,
        val passwordError: FieldError? = null
    ) : LoginResult()

    data class Failure(val error: AppError) : LoginResult()
}

enum class FieldError { REQUIRED, INVALID_URL, UNSUPPORTED_SCHEME }

/**
 * Validates the form, normalizes the URL, authenticates against the Xtream API and
 * stores the session. Credentials are only persisted when [remember] is true.
 */
class LoginUseCase(
    private val xtreamRepository: XtreamRepository,
    private val sessionRepository: SessionRepository
) {
    suspend operator fun invoke(
        rawServer: String,
        rawUsername: String,
        rawPassword: String,
        remember: Boolean
    ): LoginResult {
        val username = rawUsername.trim()
        val password = rawPassword.trim()

        val normalized = UrlNormalizer.normalize(rawServer)
        val serverError = when (normalized) {
            is UrlNormalizer.Result.Valid -> null
            is UrlNormalizer.Result.Invalid -> when (normalized.reason) {
                UrlNormalizer.Reason.EMPTY -> FieldError.REQUIRED
                UrlNormalizer.Reason.UNSUPPORTED_SCHEME -> FieldError.UNSUPPORTED_SCHEME
                UrlNormalizer.Reason.MALFORMED -> FieldError.INVALID_URL
            }
        }
        val valid = normalized as? UrlNormalizer.Result.Valid
        // A pasted M3U/API link may already contain the credentials.
        val finalUser = username.ifEmpty { valid?.username.orEmpty() }
        val finalPassword = password.ifEmpty { valid?.password.orEmpty() }

        val userError = if (finalUser.isEmpty()) FieldError.REQUIRED else null
        val passwordError = if (finalPassword.isEmpty()) FieldError.REQUIRED else null
        if (serverError != null || userError != null || passwordError != null || valid == null) {
            return LoginResult.ValidationError(serverError, userError, passwordError)
        }

        val credentials = Credentials(valid.baseUrl, finalUser, finalPassword)
        return when (val result = xtreamRepository.authenticate(credentials)) {
            is DataResult.Failure -> LoginResult.Failure(result.error)
            is DataResult.Success -> {
                val account = result.data
                when {
                    account.status.equals("expired", ignoreCase = true) -> LoginResult.Failure(AppError.AccountExpired)
                    account.status.equals("banned", ignoreCase = true) ||
                        account.status.equals("disabled", ignoreCase = true) -> LoginResult.Failure(AppError.AccountDisabled)
                    else -> {
                        xtreamRepository.clearCache()
                        sessionRepository.saveSession(Session(credentials, account, remember))
                        LoginResult.Success(account)
                    }
                }
            }
        }
    }
}
