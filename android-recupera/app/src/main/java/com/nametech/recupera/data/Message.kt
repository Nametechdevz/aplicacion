package com.nametech.recupera.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Un mensaje capturado desde una notificación de WhatsApp.
 *
 * El índice único (chatKey + sender + content + timestamp) evita guardar
 * duplicados, porque WhatsApp vuelve a publicar la notificación completa
 * cada vez que llega un mensaje nuevo al mismo chat.
 */
@Entity(
    tableName = "messages",
    indices = [Index(value = ["chatKey", "sender", "content", "timestamp"], unique = true)]
)
data class Message(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,

    /** Nombre del chat o contacto (título de la notificación). */
    val chatKey: String,

    /** Quién envió el mensaje (en grupos puede diferir del chat). */
    val sender: String,

    /** Texto del mensaje. */
    val content: String,

    /** Marca de tiempo del mensaje, en milisegundos. */
    val timestamp: Long,

    /** Paquete de origen: com.whatsapp o com.whatsapp.w4b. */
    val packageName: String,

    /** true si el texto es un aviso de "mensaje eliminado". */
    val isDeletedMarker: Boolean = false,

    /** Cuándo lo capturó la app. */
    val capturedAt: Long = System.currentTimeMillis()
)
