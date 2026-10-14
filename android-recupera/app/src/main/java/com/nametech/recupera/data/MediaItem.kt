package com.nametech.recupera.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Tipo de archivo multimedia rescatado. */
enum class MediaType { IMAGE, VIDEO, AUDIO, DOCUMENT, OTHER }

/**
 * Un archivo multimedia copiado desde la carpeta de WhatsApp a un lugar
 * seguro, para que sobreviva aunque WhatsApp lo elimine.
 *
 * El índice único (sourcePath + size) evita volver a copiar el mismo archivo.
 */
@Entity(
    tableName = "media",
    indices = [Index(value = ["sourcePath", "size"], unique = true)]
)
data class MediaItem(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,

    /** Ruta original dentro de la carpeta de WhatsApp. */
    val sourcePath: String,

    /** Ruta de la copia a salvo (dentro del almacenamiento de la app). */
    val savedPath: String,

    val fileName: String,
    val type: MediaType,
    val size: Long,

    /** Fecha del archivo original (milisegundos). */
    val sourceModified: Long,

    /** Cuándo lo copió la app. */
    val capturedAt: Long = System.currentTimeMillis()
)
