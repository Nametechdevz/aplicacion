package com.nametech.inventario.ui

import android.net.Uri
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nametech.inventario.BuildConfig
import com.nametech.inventario.InventarioApp
import com.nametech.inventario.data.AppRelease
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.CloudException
import com.nametech.inventario.data.CloudUser
import com.nametech.inventario.data.InventoryRepository
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.Sale
import com.nametech.inventario.data.SettingsRepository
import com.nametech.inventario.domain.Filter
import com.nametech.inventario.domain.today
import com.nametech.inventario.util.Updater
import com.nametech.inventario.work.ExpiryWorker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Resultado del inicio de sesión cuando hay que decidir qué hacer con los datos del teléfono. */
data class PendingLogin(
    val base: String,
    val token: String,
    val user: CloudUser,
    val serverHasData: Boolean,
    val localItems: Int,
)

/** ViewModel único de la app: expone los datos como flujos y ejecuta las acciones. */
class AppViewModel(private val app: InventarioApp) : ViewModel() {
    private val container = app.container
    val repo = container.repository
    private val settingsRepo = container.settings
    val cloud = container.cloud

    val items: StateFlow<List<Item>?> = repo.items.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val clients: StateFlow<List<Client>?> = repo.clients.stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val sales: StateFlow<List<Sale>> = repo.sales.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val settings: StateFlow<AppSettings> = settingsRepo.flow
    val today = MutableStateFlow(today())

    /** Mensajes cortos para mostrar al usuario (errores, confirmaciones). */
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages

    /** Filtro del inventario (se fija desde el panel al tocar una tarjeta). */
    var inventoryFilter by mutableStateOf(Filter.ALL)
    var inventoryCategory by mutableStateOf<String?>(null)

    /** Bloqueo con PIN. */
    var locked by mutableStateOf(settingsRepo.current.pinHash.isNotEmpty())
        private set

    // ---- sincronización
    var syncing by mutableStateOf(false)
        private set
    var syncError by mutableStateOf<String?>(null)
        private set
    private var syncJob: Job? = null
    private var brandJob: Job? = null

    // ---- actualizaciones
    var availableUpdate by mutableStateOf<AppRelease?>(null)
        private set
    var updateDismissed by mutableStateOf(false)
    var downloadProgress by mutableStateOf<Float?>(null)
        private set

    init {
        checkForUpdate()
    }

    fun message(text: String) {
        _messages.tryEmit(text)
    }

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

    private fun describe(e: Throwable): String = when (e) {
        is CloudException -> e.message ?: "Error del servidor"
        is InventoryRepository.NotAvailableException -> e.message ?: "No disponible"
        else -> "Error: ${e.message}"
    }

    private fun handleError(e: Throwable) {
        if (e is CancellationException) return
        message(describe(e))
        if (e is CloudException) {
            if (e.sessionLost) sessionLost()
            // Conflicto: otro dispositivo cambió algo; traer lo último.
            if (e.code == 409) syncNow(quiet = true)
        }
    }

    /** Ejecuta una acción mostrando el error si falla (sin servidor, ventas duplicadas, etc.). */
    fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /**
     * Igual que [launch] pero devuelve el resultado, o null si falló. Corre en el alcance del
     * ViewModel: si la pantalla que la pidió se cierra, la operación igual termina (no queda a medias).
     */
    suspend fun <T> safe(block: suspend () -> T): T? = viewModelScope.async {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleError(e)
            null
        }
    }.await()

    // ------------------------------------------------------------ ajustes

    /** Campos de la marca que se comparten con los demás dispositivos del usuario. */
    private fun AppSettings.brandKey() = brandJson().toString()

    fun updateSettings(rescheduleNotifications: Boolean = false, transform: (AppSettings) -> AppSettings) {
        val before = settingsRepo.current
        settingsRepo.update(transform)
        val after = settingsRepo.current
        if (rescheduleNotifications) ExpiryWorker.schedule(app, after)
        if (after.isCloud && before.brandKey() != after.brandKey()) {
            // Se envía al servidor un momento después de dejar de escribir.
            brandJob?.cancel()
            brandJob = viewModelScope.launch {
                delay(1500)
                try {
                    cloud.saveBrand(settingsRepo.current.brandJson())
                } catch (e: Exception) {
                    handleError(e)
                }
            }
        }
    }

    fun setPin(pin: String?) {
        settingsRepo.update { it.copy(pinHash = if (pin.isNullOrBlank()) "" else SettingsRepository.hashPin(pin)) }
    }

    fun testNotification() = ExpiryWorker.runNow(app)

    // ------------------------------------------------------------ sesión

    /** Paso 1: valida usuario y contraseña. Devuelve los datos para decidir qué hacer con lo local. */
    suspend fun login(base: String, username: String, password: String): PendingLogin? = safe {
        val device = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        val (token, user, hasData) = cloud.login(base, username, password, device)
        val s = settingsRepo.current
        // Datos locales de "este teléfono" (no de una sesión anterior del mismo usuario).
        val sameUser = s.userId == user.id && s.lastRev > 0
        val local = if (s.cloudMode && s.lastRev > 0 && !sameUser) 0 else if (sameUser) 0 else repo.countItems()
        PendingLogin(base.trim(), token, user, hasData, local)
    }

    /**
     * Paso 2: sube los datos del teléfono si se pidió, guarda la sesión y descarga el inventario.
     * Corre en el alcance del ViewModel porque la pantalla de inicio de sesión se cierra apenas
     * se guarda la sesión.
     */
    suspend fun finishLogin(p: PendingLogin, uploadLocal: Boolean): Boolean = viewModelScope.async {
        doFinishLogin(p, uploadLocal)
    }.await()

    private suspend fun doFinishLogin(p: PendingLogin, uploadLocal: Boolean): Boolean {
        val before = settingsRepo.current
        val sameUser = before.userId == p.user.id && before.lastRev > 0
        if (p.localItems > 0) {
            // Respaldo automático antes de cambiar los datos del teléfono.
            runCatching { container.backup.exportJsonToFile("antes-de-conectar-${LocalDate.now()}-${System.currentTimeMillis()}.json") }
        }
        if (uploadLocal && p.localItems > 0) {
            // Se sube antes de guardar la sesión: si falla, todo queda como estaba.
            val ok = safe { repo.uploadLocalData(p.base, p.token) } != null
            if (!ok) return false
        }
        settingsRepo.update {
            it.copy(
                authToken = p.token,
                userId = p.user.id,
                userName = p.user.name,
                username = p.user.username,
                userRole = p.user.role,
                accessExpiresAt = p.user.expiresAt,
                lastRev = if (sameUser) it.lastRev else 0,
            )
        }
        val pulled = safe { repo.pull() } != null
        if (pulled) message("Bienvenido, ${p.user.name} 👋")
        startSync()
        checkForUpdate()
        return pulled
    }

    /** Cerrar sesión: se borran del teléfono los datos de la cuenta (siguen seguros en el servidor). */
    fun logout() = launch {
        stopSync()
        cloud.logout()
        settingsRepo.update {
            it.copy(authToken = "", userId = 0, userName = "", username = "", userRole = "", accessExpiresAt = 0, lastRev = 0)
        }
        repo.clearLocal()
    }

    /** El servidor rechazó la sesión (contraseña cambiada, usuario desactivado, acceso vencido). */
    private fun sessionLost() {
        stopSync()
        settingsRepo.update { it.copy(authToken = "") }
    }

    fun changePassword(current: String, new: String, onDone: () -> Unit) = launch {
        cloud.changePassword(current, new)
        message("Contraseña actualizada ✅")
        onDone()
    }

    // ------------------------------------------------------------ sincronización

    fun syncNow(quiet: Boolean = false) {
        if (!settingsRepo.current.isCloud) return
        viewModelScope.launch {
            syncing = true
            try {
                repo.pull()
                syncError = null
                if (!quiet) message("Sincronizado ✅")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                syncError = describe(e)
                if (e is CloudException && e.sessionLost) handleError(e) else if (!quiet) message(describe(e))
            } finally {
                syncing = false
            }
        }
    }

    /** Mientras la app está abierta, trae los cambios de los otros dispositivos cada 20 segundos. */
    fun startSync() {
        if (!settingsRepo.current.isCloud || syncJob?.isActive == true) return
        syncJob = viewModelScope.launch {
            while (isActive && settingsRepo.current.isCloud) {
                try {
                    syncing = true
                    repo.pull()
                    syncError = null
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    syncError = describe(e)
                    if (e is CloudException && e.sessionLost) {
                        handleError(e)
                        break
                    }
                } finally {
                    syncing = false
                }
                delay(20_000)
            }
        }
    }

    fun stopSync() {
        syncJob?.cancel()
        syncJob = null
    }

    // ------------------------------------------------------------ actualizaciones

    fun checkForUpdate(manual: Boolean = false) {
        val base = settingsRepo.current.serverUrl
        if (base.isBlank()) {
            if (manual) message("Conecte la app a su servidor para buscar actualizaciones")
            return
        }
        viewModelScope.launch {
            try {
                val r = cloud.latestRelease(base)
                if (r != null && r.versionCode > BuildConfig.VERSION_CODE) {
                    availableUpdate = r
                    updateDismissed = false
                } else if (manual) {
                    message("Ya tiene la última versión (${BuildConfig.VERSION_NAME}) ✅")
                }
            } catch (e: Exception) {
                if (manual) message(describe(e))
            }
        }
    }

    /** Descarga el APK nuevo y abre el instalador (se instala encima; no se pierde nada). */
    fun installUpdate() {
        val r = availableUpdate ?: return
        if (downloadProgress != null) return
        viewModelScope.launch {
            downloadProgress = 0f
            try {
                val file = Updater.download(app, r.url) { downloadProgress = it }
                Updater.install(app, file)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                message("No se pudo descargar: ${e.message}. Se abrirá el navegador.")
                Updater.openInBrowser(app, r.url)
            } finally {
                downloadProgress = null
            }
        }
    }

    // ------------------------------------------------------------ respaldos

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
