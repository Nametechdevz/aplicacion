package com.nametech.inventario.ui

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nametech.inventario.InventarioApp
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.Sale
import com.nametech.inventario.data.SettingsRepository
import com.nametech.inventario.domain.Filter
import com.nametech.inventario.domain.today
import com.nametech.inventario.work.ExpiryWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** ViewModel único de la app: expone los datos como flujos y ejecuta las acciones. */
class AppViewModel(private val app: InventarioApp) : ViewModel() {
    private val container = app.container
    val repo = container.repository
    private val settingsRepo = container.settings

    val items: StateFlow<List<Item>?> = repo.items.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val clients: StateFlow<List<Client>?> = repo.clients.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val sales: StateFlow<List<Sale>> = repo.sales.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val settings: StateFlow<AppSettings> = settingsRepo.flow
    val today = MutableStateFlow(today())

    /** Filtro del inventario (se fija desde el panel al tocar una tarjeta). */
    var inventoryFilter by mutableStateOf(Filter.ALL)
    var inventoryCategory by mutableStateOf<String?>(null)

    /** Bloqueo con PIN. */
    var locked by mutableStateOf(settingsRepo.current.pinHash.isNotEmpty())
        private set

    fun refreshToday() {
        today.value = today()
    }

    fun unlock(pin: String): Boolean {
        val ok = SettingsRepository.hashPin(pin) == settingsRepo.current.pinHash
        if (ok) locked = false
        return ok
    }

    fun lockIfNeeded() {
        if (settingsRepo.current.pinHash.isNotEmpty()) locked = true
    }

    fun updateSettings(rescheduleNotifications: Boolean = false, transform: (AppSettings) -> AppSettings) {
        settingsRepo.update(transform)
        if (rescheduleNotifications) ExpiryWorker.schedule(app, settingsRepo.current)
    }

    fun setPin(pin: String?) {
        settingsRepo.update { it.copy(pinHash = if (pin.isNullOrBlank()) "" else SettingsRepository.hashPin(pin)) }
    }

    fun testNotification() = ExpiryWorker.runNow(app)

    fun launch(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }

    fun backupTo(uri: Uri, onDone: (String) -> Unit) = launch {
        onDone(runCatching { container.backup.exportJson(uri) }.fold({ "Respaldo guardado ✅" }, { "Error: ${it.message}" }))
    }

    fun restoreFrom(uri: Uri, onDone: (String) -> Unit) = launch {
        onDone(
            runCatching { container.backup.importJson(uri) }
                .fold({ "Respaldo restaurado: $it productos ✅" }, { "Error: ${it.message}" }),
        )
    }

    fun exportItemsCsv(uri: Uri, onDone: (String) -> Unit) = launch {
        onDone(runCatching { container.backup.exportItemsCsv(uri) }.fold({ "Inventario exportado ✅" }, { "Error: ${it.message}" }))
    }

    fun exportSalesCsv(uri: Uri, onDone: (String) -> Unit) = launch {
        onDone(runCatching { container.backup.exportSalesCsv(uri) }.fold({ "Ventas exportadas ✅" }, { "Error: ${it.message}" }))
    }
}
