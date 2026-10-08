package com.nametech.inventario.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

object ItemStatus {
    const val AVAILABLE = "AVAILABLE"
    const val SOLD = "SOLD"
    const val INACTIVE = "INACTIVE"
}

object SaleKind {
    const val SALE = "VENTA"
    const val RENEWAL = "RENOVACION"
}

/**
 * Un producto del inventario: una cuenta/perfil de streaming, un curso, un sistema web, etc.
 * Las fechas se guardan como días desde época (LocalDate.toEpochDay()).
 */
@Entity(tableName = "items", indices = [Index("clientId"), Index("status")])
data class Item(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val category: String = "STREAMING",
    val name: String = "",
    val plan: String = "",
    val accessUser: String = "",
    val accessPassword: String = "",
    val profilePin: String = "",
    val accessUrl: String = "",
    val extraInfo: String = "",
    val supplier: String = "",
    val costPrice: Double = 0.0,
    val suggestedPrice: Double = 0.0,
    /** Fecha en que se compró al proveedor. */
    val purchaseDate: Long? = null,
    /** Vencimiento de la cuenta con el proveedor. */
    val expirationDate: Long? = null,
    val status: String = ItemStatus.AVAILABLE,
    val clientId: Long? = null,
    val saleDate: Long? = null,
    val salePrice: Double = 0.0,
    /** Vencimiento del servicio para el cliente. */
    val clientExpirationDate: Long? = null,
    val paid: Boolean = true,
    /** Último recordatorio enviado (epoch millis). */
    val lastReminderAt: Long? = null,
    val notes: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
)

@Entity(tableName = "clients")
data class Client(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String = "",
    val whatsapp: String = "",
    val email: String = "",
    val notes: String = "",
    val createdAt: Long = System.currentTimeMillis(),
)

/** Registro histórico de ventas y renovaciones (para reportes de ingresos y ganancias). */
@Entity(tableName = "sales", indices = [Index("itemId"), Index("clientId"), Index("date")])
data class Sale(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val itemId: Long? = null,
    val clientId: Long? = null,
    val itemName: String = "",
    val clientName: String = "",
    val category: String = "",
    val amount: Double = 0.0,
    val cost: Double = 0.0,
    val date: Long = 0,
    val kind: String = SaleKind.SALE,
    val createdAt: Long = System.currentTimeMillis(),
)
