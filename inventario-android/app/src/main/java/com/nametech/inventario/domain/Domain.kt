package com.nametech.inventario.domain

import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.data.isAccount
import com.nametech.inventario.data.isProfile
import java.time.LocalDate

/** Tipos de producto que vende el negocio. */
enum class Category(val label: String, val suggestions: List<String>) {
    STREAMING(
        "Streaming",
        listOf(
            "Netflix", "Disney+", "Max", "Prime Video", "Spotify", "YouTube Premium",
            "Crunchyroll", "Paramount+", "Vix", "Apple TV+", "Plex", "Deezer",
        ),
    ),
    IPTV("IPTV / TV", listOf("IPTV", "Magis TV", "Flujo TV", "DirecTV Go", "Win Sports")),
    CURSO("Curso", listOf("Curso de Excel", "Curso de Marketing", "Curso de Programación", "Platzi", "Domestika", "Udemy")),
    SISTEMA_WEB("Sistema web", listOf("Página web", "Tienda online", "Sistema de facturación", "CRM", "Hosting", "Dominio")),
    APLICACION("Aplicación", listOf("App Android", "App iOS", "App de escritorio")),
    LICENCIA("Licencia / Software", listOf("Office 365", "Windows", "Canva Pro", "ChatGPT Plus", "CapCut Pro", "Antivirus", "VPN")),
    JUEGOS("Juegos", listOf("Xbox Game Pass", "PlayStation Plus", "Free Fire", "Steam")),
    OTRO("Otro", emptyList());

    companion object {
        fun of(name: String?): Category = entries.firstOrNull { it.name == name } ?: OTRO
    }
}

/** Estado de tiempo de un producto según su fecha de vencimiento efectiva. */
enum class TimeState { NONE, OK, DUE_SOON, EXPIRED }

/** Filtros del inventario. */
enum class Filter(val label: String) {
    ALL("Todas"),
    AVAILABLE("Disponibles"),
    SOLD("Vendidas"),
    DUE_SOON("Por vencer"),
    EXPIRED("Vencidas"),
    UNPAID("Por cobrar"),
    INACTIVE("Inactivas"),
}

fun today(): Long = LocalDate.now().toEpochDay()

/**
 * Fecha que manda para el estado del producto: si está vendido, la del cliente
 * (o la de la cuenta si no se definió); si está disponible, la de la cuenta.
 */
fun Item.effectiveExpiration(): Long? =
    if (status == ItemStatus.SOLD) clientExpirationDate ?: expirationDate else expirationDate

fun Item.daysLeft(today: Long): Long? = effectiveExpiration()?.let { it - today }

fun Item.timeState(today: Long, dueSoonDays: Int): TimeState {
    val days = daysLeft(today) ?: return TimeState.NONE
    return when {
        days < 0 -> TimeState.EXPIRED
        days <= dueSoonDays -> TimeState.DUE_SOON
        else -> TimeState.OK
    }
}

/** Estado de la cuenta con el proveedor (independiente del cliente). */
fun Item.accountTimeState(today: Long, dueSoonDays: Int): TimeState {
    val exp = expirationDate ?: return TimeState.NONE
    val days = exp - today
    return when {
        days < 0 -> TimeState.EXPIRED
        days <= dueSoonDays -> TimeState.DUE_SOON
        else -> TimeState.OK
    }
}

fun Item.matches(filter: Filter, today: Long, dueSoonDays: Int): Boolean {
    val active = status != ItemStatus.INACTIVE
    return when (filter) {
        Filter.ALL -> active
        Filter.AVAILABLE -> status == ItemStatus.AVAILABLE && timeState(today, dueSoonDays) != TimeState.EXPIRED
        Filter.SOLD -> status == ItemStatus.SOLD
        Filter.DUE_SOON -> active && timeState(today, dueSoonDays) == TimeState.DUE_SOON
        Filter.EXPIRED -> active && timeState(today, dueSoonDays) == TimeState.EXPIRED
        Filter.UNPAID -> status == ItemStatus.SOLD && !paid
        Filter.INACTIVE -> status == ItemStatus.INACTIVE
    }
}

fun daysText(days: Long?): String = when {
    days == null -> "Sin vencimiento"
    days < -1 -> "Venció hace ${-days} días"
    days == -1L -> "Venció ayer"
    days == 0L -> "Vence hoy"
    days == 1L -> "Vence mañana"
    else -> "Faltan $days días"
}

enum class SortOrder(val label: String) {
    EXPIRATION("Vencimiento más próximo"),
    RECENT("Más recientes"),
    NAME("Nombre (A-Z)"),
    PRICE("Precio de venta"),
}

fun List<Item>.sortedWithOrder(order: SortOrder): List<Item> = when (order) {
    SortOrder.EXPIRATION -> sortedWith(compareBy(nullsLast<Long>()) { it.effectiveExpiration() })
    SortOrder.RECENT -> sortedByDescending { it.createdAt }
    SortOrder.NAME -> sortedBy { it.name.lowercase() }
    SortOrder.PRICE -> sortedByDescending { if (it.status == ItemStatus.SOLD) it.salePrice else it.suggestedPrice }
}

fun Item.matchesQuery(query: String, clientName: String?): Boolean {
    if (query.isBlank()) return true
    val q = query.trim().lowercase()
    return listOf(name, plan, accessUser, profilePin, supplier, notes, clientName.orEmpty(), Category.of(category).label)
        .any { it.lowercase().contains(q) }
}

/**
 * Vista del inventario que entiende las cuentas completas con perfiles:
 * los perfiles libres se muestran dentro de su cuenta; los vendidos aparecen como ventas normales.
 */
class Stock(val all: List<Item>) {
    private val byId = all.associateBy { it.id }
    private val children: Map<Long, List<Item>> =
        all.filter { it.parentId != null }.groupBy { it.parentId!! }.mapValues { (_, v) -> v.sortedBy { it.createdAt } }

    /** Lo que se lista en el inventario (sin perfiles libres ni perfiles dados de baja). */
    val visible: List<Item> = all.filter { !(it.isProfile && it.status != ItemStatus.SOLD && byId.containsKey(it.parentId)) }

    fun profilesOf(account: Item): List<Item> = children[account.id].orEmpty()

    fun parentOf(item: Item): Item? = item.parentId?.let { byId[it] }

    fun hasProfiles(item: Item): Boolean = item.isAccount && profilesOf(item).isNotEmpty()

    /** Perfiles que se pueden vender (ninguno si la cuenta se vendió completa o está inactiva). */
    fun freeProfiles(account: Item): List<Item> =
        if (account.status != ItemStatus.AVAILABLE) emptyList()
        else profilesOf(account).filter { it.status == ItemStatus.AVAILABLE }

    fun soldProfiles(account: Item): List<Item> = profilesOf(account).filter { it.status == ItemStatus.SOLD }

    /** La cuenta completa solo se puede vender si ningún perfil está vendido. */
    fun canSellFull(account: Item): Boolean = account.status == ItemStatus.AVAILABLE && soldProfiles(account).isEmpty()

    fun matches(item: Item, filter: Filter, today: Long, dueSoonDays: Int): Boolean {
        if (filter == Filter.AVAILABLE && hasProfiles(item) && item.status == ItemStatus.AVAILABLE) {
            return freeProfiles(item).isNotEmpty() && item.timeState(today, dueSoonDays) != TimeState.EXPIRED
        }
        return item.matches(filter, today, dueSoonDays)
    }

    fun count(filter: Filter, today: Long, dueSoonDays: Int, from: List<Item> = visible): Int =
        from.count { matches(it, filter, today, dueSoonDays) }
}
