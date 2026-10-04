package com.webpro.player.ui.adaptive

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Describes the current device so screens can adapt layout, sizes and navigation. */
data class DeviceProfile(
    val isTv: Boolean,
    val widthClass: WindowWidthSizeClass
) {
    val isCompact: Boolean get() = !isTv && widthClass == WindowWidthSizeClass.Compact
    val useNavigationRail: Boolean get() = !isCompact
    val useSideCategories: Boolean get() = isTv || widthClass == WindowWidthSizeClass.Expanded

    val posterMinWidth: Dp
        get() = when {
            isTv -> 150.dp
            widthClass == WindowWidthSizeClass.Expanded -> 150.dp
            widthClass == WindowWidthSizeClass.Medium -> 132.dp
            else -> 104.dp
        }

    val screenPadding: Dp
        get() = when {
            isTv -> 32.dp
            widthClass == WindowWidthSizeClass.Compact -> 16.dp
            else -> 24.dp
        }

    val tileMinWidth: Dp get() = if (isTv) 220.dp else if (isCompact) 150.dp else 200.dp

    companion object {
        fun isTelevision(context: Context): Boolean {
            val pm = context.packageManager
            if (pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) return true
            val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
            return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        }
    }
}

val LocalDeviceProfile = staticCompositionLocalOf {
    DeviceProfile(isTv = false, widthClass = WindowWidthSizeClass.Compact)
}
