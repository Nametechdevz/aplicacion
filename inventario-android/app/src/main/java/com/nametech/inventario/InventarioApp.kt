package com.nametech.inventario

import android.app.Application
import android.content.Context
import com.nametech.inventario.data.AppDatabase
import com.nametech.inventario.data.BackupManager
import com.nametech.inventario.data.InventoryRepository
import com.nametech.inventario.data.SettingsRepository
import com.nametech.inventario.work.ExpiryWorker

class AppContainer(context: Context) {
    private val db = AppDatabase.build(context)
    val settings = SettingsRepository(context)
    val repository = InventoryRepository(db)
    val backup = BackupManager(context, repository)
}

class InventarioApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        ExpiryWorker.createChannel(this)
        ExpiryWorker.schedule(this, container.settings.current, replace = false)
    }
}
