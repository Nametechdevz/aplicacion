package com.webpro.player.ui.common

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.webpro.player.R
import com.webpro.player.domain.model.AppError
import com.webpro.player.player.PlayerError

@StringRes
fun AppError.messageRes(): Int = when (this) {
    AppError.InvalidCredentials -> R.string.error_invalid_credentials
    AppError.AccountExpired -> R.string.error_account_expired
    AppError.AccountDisabled -> R.string.error_account_disabled
    AppError.NoConnection -> R.string.error_no_connection
    AppError.Timeout -> R.string.error_timeout
    AppError.ServerUnreachable -> R.string.error_server_unreachable
    is AppError.Http -> R.string.error_http
    AppError.InvalidResponse -> R.string.error_invalid_response
    AppError.InvalidUrl -> R.string.error_invalid_url
    AppError.NotFound -> R.string.error_not_found
    AppError.NotLoggedIn -> R.string.error_not_logged_in
    is AppError.Unknown -> R.string.error_unknown
}

@Composable
fun AppError.message(): String = when (this) {
    is AppError.Http -> stringResource(R.string.error_http, code)
    else -> stringResource(messageRes())
}

@Composable
fun PlayerError.message(): String = when (this) {
    PlayerError.Timeout -> stringResource(R.string.player_error_timeout)
    PlayerError.ConnectionReset -> stringResource(R.string.player_error_connection_reset)
    PlayerError.Network -> stringResource(R.string.player_error_network)
    PlayerError.BehindLiveWindow -> stringResource(R.string.player_error_behind_live)
    PlayerError.Unauthorized -> stringResource(R.string.player_error_401)
    PlayerError.Forbidden -> stringResource(R.string.player_error_403)
    PlayerError.NotFound -> stringResource(R.string.player_error_404)
    is PlayerError.ServerError -> stringResource(R.string.player_error_server, httpCode)
    PlayerError.Source -> stringResource(R.string.player_error_source)
    PlayerError.Decoder -> stringResource(R.string.player_error_decoder)
    PlayerError.Unknown -> stringResource(R.string.player_error_unknown)
}
