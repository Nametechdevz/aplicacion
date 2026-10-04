package com.webpro.player.ui.common

import com.webpro.player.domain.model.AppError

/** Every screen renders one of these four states; nothing stays frozen without feedback. */
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data object Empty : UiState<Nothing>
    data class Error(val error: AppError) : UiState<Nothing>
}
