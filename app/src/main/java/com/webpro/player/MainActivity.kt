package com.webpro.player

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.webpro.player.navigation.AppNavHost
import com.webpro.player.ui.adaptive.DeviceProfile
import com.webpro.player.ui.adaptive.LocalDeviceProfile
import com.webpro.player.ui.theme.WebProColors
import com.webpro.player.ui.theme.WebProTheme

class MainActivity : ComponentActivity() {

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val isTv = DeviceProfile.isTelevision(this)
        setContent {
            val windowSize = calculateWindowSizeClass(this)
            val profile = remember(isTv, windowSize.widthSizeClass) {
                DeviceProfile(isTv = isTv, widthClass = windowSize.widthSizeClass)
            }
            val sessionRepository = (application as WebProApp).container.sessionRepository
            val session by sessionRepository.session.collectAsState()
            // Restore the remembered session before building the navigation graph, so a
            // process recreated directly on a deep screen (e.g. the player) has credentials.
            var sessionChecked by remember { mutableStateOf(false) }
            LaunchedEffect(Unit) {
                runCatching { sessionRepository.restore() }
                sessionChecked = true
            }
            WebProTheme {
                CompositionLocalProvider(LocalDeviceProfile provides profile) {
                    Box(
                        Modifier
                            .fillMaxSize()
                            .background(WebProColors.Background)
                    ) {
                        if (sessionChecked) AppNavHost(isLoggedIn = session != null)
                    }
                }
            }
        }
    }
}
