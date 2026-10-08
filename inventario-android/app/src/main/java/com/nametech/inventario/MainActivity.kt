package com.nametech.inventario

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.nametech.inventario.ui.AppRoot
import com.nametech.inventario.ui.AppViewModel
import com.nametech.inventario.ui.theme.InventarioTheme
import com.nametech.inventario.work.ExpiryWorker

class MainActivity : ComponentActivity() {
    private lateinit var vm: AppViewModel
    private var backgroundSince = 0L
    private val openRequest = mutableStateOf<String?>(null)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as InventarioApp
        vm = ViewModelProvider(this, viewModelFactory { initializer { AppViewModel(app) } })[AppViewModel::class.java]
        handleIntent(intent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && savedInstanceState == null) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        setContent {
            val settings by vm.settings.collectAsState()
            InventarioTheme(themeMode = settings.themeMode) {
                AppRoot(vm = vm, openRequest = openRequest)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.getStringExtra(ExpiryWorker.EXTRA_OPEN)?.let { openRequest.value = it }
    }

    override fun onStart() {
        super.onStart()
        vm.refreshToday()
        // Bloquear de nuevo si la app estuvo más de 2 minutos en segundo plano.
        if (backgroundSince > 0 && System.currentTimeMillis() - backgroundSince > 2 * 60_000) vm.lockIfNeeded()
        backgroundSince = 0
        vm.startSync()
    }

    override fun onStop() {
        super.onStop()
        backgroundSince = System.currentTimeMillis()
        vm.stopSync()
    }
}
