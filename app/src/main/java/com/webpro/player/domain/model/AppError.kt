package com.webpro.player.domain.model

/** Errors produced by the data layer, mapped to user friendly messages by the UI. */
sealed class AppError {
    data object InvalidCredentials : AppError()
    data object AccountExpired : AppError()
    data object AccountDisabled : AppError()
    data object NoConnection : AppError()
    data object Timeout : AppError()
    data object ServerUnreachable : AppError()
    data class Http(val code: Int) : AppError()
    data object InvalidResponse : AppError()
    data object InvalidUrl : AppError()
    data object NotFound : AppError()
    data object NotLoggedIn : AppError()
    data class Unknown(val reason: String? = null) : AppError()
}

/** Minimal result wrapper used across repositories and use cases. */
sealed class DataResult<out T> {
    data class Success<T>(val data: T) : DataResult<T>()
    data class Failure(val error: AppError) : DataResult<Nothing>()

    inline fun <R> map(transform: (T) -> R): DataResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Failure -> this
    }

    fun getOrNull(): T? = (this as? Success)?.data
}
