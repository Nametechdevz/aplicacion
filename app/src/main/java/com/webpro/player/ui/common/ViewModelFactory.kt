package com.webpro.player.ui.common

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import com.webpro.player.WebProApp
import com.webpro.player.di.AppContainer

/** Access to the [AppContainer] from a ViewModel factory initializer. */
fun CreationExtras.appContainer(): AppContainer =
    (this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as WebProApp).container
