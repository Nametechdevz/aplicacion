package com.webpro.player.ui.splash

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.webpro.player.R
import com.webpro.player.ui.components.AppLogo
import com.webpro.player.ui.theme.WebProBrushes
import com.webpro.player.ui.theme.WebProColors

@Composable
fun SplashScreen(
    onLoggedIn: () -> Unit,
    onLoggedOut: () -> Unit,
    viewModel: SplashViewModel = viewModel(factory = SplashViewModel.Factory)
) {
    val destination by viewModel.destination.collectAsStateWithLifecycle()
    LaunchedEffect(destination) {
        when (destination) {
            StartDestination.MAIN -> onLoggedIn()
            StartDestination.LOGIN -> onLoggedOut()
            StartDestination.UNDECIDED -> Unit
        }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(WebProBrushes.BackgroundGlow),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            AppLogo(iconSize = 64.dp, textSize = 34.sp)
            Spacer(Modifier.height(14.dp))
            Text(
                stringResource(R.string.app_tagline),
                style = MaterialTheme.typography.bodyLarge,
                color = WebProColors.TextSecondary
            )
            Spacer(Modifier.height(36.dp))
            LinearProgressIndicator(
                modifier = Modifier.width(180.dp),
                color = WebProColors.Primary,
                trackColor = WebProColors.SurfaceHighest
            )
        }
    }
}
