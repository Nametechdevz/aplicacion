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

    private val dao = AppDatabase.get(app).messageDao()

    val allMessages = dao.all()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val deletedMessages = dao.deletedMarkers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val count = dao.count()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun clearAll() = viewModelScope.launch { dao.clearAll() }

    fun groupedByChat(messages: List<Message>): Map<String, List<Message>> =
        messages.groupBy { it.chatKey }
}
