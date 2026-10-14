package com.nametech.recupera.service

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import com.nametech.recupera.data.AppDatabase
import com.nametech.recupera.data.Message
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Escucha las notificaciones del propio teléfono y guarda las de WhatsApp.
 *
 * Importante: solo se captura lo que GENERA una notificación y que llega
 * DESPUÉS de activar el servicio. No accede a los chats ni a los servidores
 * de WhatsApp. Es la misma técnica que usan apps como WAMR.
 */
class NotificationListener : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName
        if (pkg != WHATSAPP && pkg != WHATSAPP_BUSINESS) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        // Saltar el resumen del grupo de notificaciones ("3 mensajes nuevos").
        if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false) &&
            extras.getCharSequence(Notification.EXTRA_TEXT) == null &&
            NotificationCompat.MessagingStyle
                .extractMessagingStyleFromNotification(notification) == null
        ) return

        val chatTitle = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
            ?: return

        val rows = extractMessages(notification, chatTitle, pkg)
        if (rows.isEmpty()) return

        val dao = AppDatabase.get(applicationContext).messageDao()
        scope.launch {
            rows.forEach { dao.insert(it) }
        }
    }

    /**
     * Saca los mensajes de la notificación. Primero intenta con MessagingStyle
     * (lo más rico: separa cada línea con su remitente y hora); si no, cae al
     * texto plano.
     */
    private fun extractMessages(
        notification: Notification,
        chatTitle: String,
        pkg: String
    ): List<Message> {
        val style = NotificationCompat.MessagingStyle
            .extractMessagingStyleFromNotification(notification)

        if (style != null && style.messages.isNotEmpty()) {
            return style.messages.mapNotNull { m ->
                val text = m.text?.toString()?.trim().orEmpty()
                if (text.isEmpty()) return@mapNotNull null
                val sender = m.person?.name?.toString()?.trim().orEmpty()
                    .ifEmpty { chatTitle }
                Message(
                    chatKey = chatTitle,
                    sender = sender,
                    content = text,
                    timestamp = m.timestamp,
                    packageName = pkg,
                    isDeletedMarker = isDeletedText(text)
                )
            }
        }

        // Respaldo: texto plano de la notificación.
        val extras = notification.extras
        val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        val whenMs = if (notification.`when` > 0) notification.`when` else System.currentTimeMillis()
        if (lines != null && lines.isNotEmpty()) {
            return lines.mapNotNull { raw ->
                val text = raw?.toString()?.trim().orEmpty()
                if (text.isEmpty()) null
                else Message(
                    chatKey = chatTitle,
                    sender = chatTitle,
                    content = text,
                    timestamp = whenMs,
                    packageName = pkg,
                    isDeletedMarker = isDeletedText(text)
                )
            }
        }

        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return emptyList()
        return listOf(
            Message(
                chatKey = chatTitle,
                sender = chatTitle,
                content = text,
                timestamp = whenMs,
                packageName = pkg,
                isDeletedMarker = isDeletedText(text)
            )
        )
    }

    /** Reconoce el aviso "mensaje eliminado" en varios idiomas. */
    private fun isDeletedText(text: String): Boolean {
        val t = text.lowercase()
        return DELETED_PHRASES.any { t.contains(it) }
    }

    companion object {
        private const val WHATSAPP = "com.whatsapp"
        private const val WHATSAPP_BUSINESS = "com.whatsapp.w4b"

        private val DELETED_PHRASES = listOf(
            "this message was deleted",
            "you deleted this message",
            "se eliminó este mensaje",
            "eliminaste este mensaje",
            "esta mensagem foi apagada",
            "ce message a été supprimé",
            "questo messaggio è stato eliminato"
        )
    }
}
