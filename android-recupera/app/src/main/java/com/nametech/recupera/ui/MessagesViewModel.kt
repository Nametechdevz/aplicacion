package com.nametech.recupera.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nametech.recupera.data.AppDatabase
import com.nametech.recupera.data.Message
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MessagesViewModel(app: Application) : AndroidViewModel(app) {

    private val db = AppDatabase.get(app)
    private val dao = db.messageDao()
    private val mediaDao = db.mediaDao()

    val allMessages = dao.all()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val deletedMessages = dao.deletedMarkers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val count = dao.count()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    val media = mediaDao.all()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val mediaCount = mediaDao.count()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun clearAll() = viewModelScope.launch {
        dao.clearAll()
        mediaDao.clearAll()
    }
}
