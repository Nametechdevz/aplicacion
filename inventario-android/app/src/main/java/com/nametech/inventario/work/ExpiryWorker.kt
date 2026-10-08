package com.nametech.inventario.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.nametech.inventario.InventarioApp
import com.nametech.inventario.MainActivity
import com.nametech.inventario.R
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.displayName
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.accountTimeState
import com.nametech.inventario.domain.daysLeft
import com.nametech.inventario.domain.daysText
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.domain.today
import java.time.Duration
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

/** Revisión diaria: avisa de servicios por vencer, vencidos y cuentas del proveedor por renovar. */
class ExpiryWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val container = (applicationContext as InventarioApp).container
        val s = container.settings.current
        val force = inputData.getBoolean(KEY_FORCE, false)
        if (!s.notificationsEnabled && !force) return Result.success()

        val t = today()
        val clients = container.repository.allClients().associateBy { it.id }
        val active = container.repository.allItems().filter { it.status != ItemStatus.INACTIVE }
        val sold = active.filter { it.status == ItemStatus.SOLD }
        val dueSoon = sold.filter { it.timeState(t, s.dueSoonDays) == TimeState.DUE_SOON }
        val expired = sold.filter { it.timeState(t, s.dueSoonDays) == TimeState.EXPIRED }
        val accounts = active.filter {
            val st = it.accountTimeState(t, s.dueSoonDays)
            st == TimeState.DUE_SOON || st == TimeState.EXPIRED
        }
        val unpaid = sold.count { !it.paid }

        if (dueSoon.isEmpty() && expired.isEmpty() && accounts.isEmpty() && unpaid == 0) {
            if (force) notify(applicationContext, "Todo al día ✅", "No hay servicios por vencer ni vencidos.", emptyList())
            return Result.success()
        }

        val title = buildList {
            if (dueSoon.isNotEmpty()) add("${dueSoon.size} por vencer")
            if (expired.isNotEmpty()) add("${expired.size} vencidas")
            if (unpaid > 0) add("$unpaid por cobrar")
        }.joinToString(" · ").ifEmpty { "Cuentas del proveedor por renovar" }

        val lines = (dueSoon + expired).sortedBy { it.daysLeft(t) }.take(6).map {
            val client = it.clientId?.let { id -> clients[id]?.name }.orEmpty()
            "${it.displayName()} · $client · ${daysText(it.daysLeft(t))}"
        } + accounts.take(3).map { "Proveedor: ${it.displayName()} (${daysText(it.expirationDate?.minus(t))})" }

        notify(applicationContext, title, "Toca para enviar los recordatorios por WhatsApp", lines)
        return Result.success()
    }

    companion object {
        private const val UNIQUE = "expiry-daily"
        private const val KEY_FORCE = "force"
        const val CHANNEL_ID = "vencimientos"
        const val EXTRA_OPEN = "open"

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(CHANNEL_ID, "Vencimientos", NotificationManager.IMPORTANCE_DEFAULT)
                channel.description = "Avisos de servicios por vencer y vencidos"
                context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            }
        }

        /**
         * Programa la revisión diaria a la hora configurada. Con [replace] = false se conserva
         * la programación existente (el arranque del proceso no debe cancelar un trabajo en curso).
         */
        fun schedule(context: Context, s: AppSettings, replace: Boolean = true) {
            val wm = WorkManager.getInstance(context)
            if (!s.notificationsEnabled) {
                wm.cancelUniqueWork(UNIQUE)
                return
            }
            val now = LocalDateTime.now()
            var next = now.withHour(s.notifyHour).withMinute(0).withSecond(0).withNano(0)
            if (!next.isAfter(now)) next = next.plusDays(1)
            val delay = Duration.between(now, next).toMinutes()
            val request = PeriodicWorkRequestBuilder<ExpiryWorker>(1, TimeUnit.DAYS)
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .build()
            val policy = if (replace) ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE else ExistingPeriodicWorkPolicy.KEEP
            wm.enqueueUniquePeriodicWork(UNIQUE, policy, request)
        }

        fun runNow(context: Context) {
            WorkManager.getInstance(context).enqueue(
                OneTimeWorkRequestBuilder<ExpiryWorker>().setInputData(workDataOf(KEY_FORCE to true)).build(),
            )
        }

        private fun notify(context: Context, title: String, text: String, lines: List<String>) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) return

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_OPEN, "reminders")
            }
            val pending = PendingIntent.getActivity(
                context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val style = NotificationCompat.InboxStyle().setBigContentTitle(title)
            lines.forEach { style.addLine(it) }
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(if (lines.isEmpty()) null else style)
                .setContentIntent(pending)
                .setAutoCancel(true)
                .build()
            NotificationManagerCompat.from(context).notify(100, notification)
        }
    }
}
