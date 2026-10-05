package com.webpro.player.desktop.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.PointerMatcher
import androidx.compose.foundation.onClick
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.PointerButton

/** Right click (secondary button) action, e.g. toggle favorite. */
@OptIn(ExperimentalFoundationApi::class)
fun Modifier.onSecondaryClick(action: (() -> Unit)?): Modifier =
    if (action == null) this
    else this.onClick(matcher = PointerMatcher.mouse(PointerButton.Secondary), onClick = action)
