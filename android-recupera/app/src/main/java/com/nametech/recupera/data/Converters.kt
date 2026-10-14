package com.nametech.recupera.data

import androidx.room.TypeConverter

/** Room no convierte enums por sí solo; aquí se guarda como texto. */
class Converters {
    @TypeConverter
    fun fromMediaType(type: MediaType): String = type.name

    @TypeConverter
    fun toMediaType(value: String): MediaType =
        runCatching { MediaType.valueOf(value) }.getOrDefault(MediaType.OTHER)
}
