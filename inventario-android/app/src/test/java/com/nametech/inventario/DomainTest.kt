package com.nametech.inventario

import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemKind
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.Filter
import com.nametech.inventario.domain.Stock
import com.nametech.inventario.domain.TimeState
import com.nametech.inventario.domain.matches
import com.nametech.inventario.domain.timeState
import com.nametech.inventario.util.Messages
import com.nametech.inventario.util.WhatsApp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainTest {
    private val today = 20_000L

    @Test
    fun estadoSegunVencimiento() {
        val base = Item(name = "Netflix")
        assertEquals(TimeState.NONE, base.timeState(today, 3))
        assertEquals(TimeState.OK, base.copy(expirationDate = today + 10).timeState(today, 3))
        assertEquals(TimeState.DUE_SOON, base.copy(expirationDate = today + 3).timeState(today, 3))
        assertEquals(TimeState.DUE_SOON, base.copy(expirationDate = today).timeState(today, 3))
        assertEquals(TimeState.EXPIRED, base.copy(expirationDate = today - 1).timeState(today, 3))
    }

    @Test
    fun vendidaUsaVencimientoDelCliente() {
        val sold = Item(status = ItemStatus.SOLD, expirationDate = today + 30, clientExpirationDate = today - 2)
        assertEquals(TimeState.EXPIRED, sold.timeState(today, 3))
        assertTrue(sold.matches(Filter.EXPIRED, today, 3))
        assertTrue(sold.matches(Filter.SOLD, today, 3))
        assertFalse(sold.matches(Filter.AVAILABLE, today, 3))
    }

    @Test
    fun filtrosExcluyenInactivas() {
        val inactive = Item(status = ItemStatus.INACTIVE, expirationDate = today - 5)
        assertFalse(inactive.matches(Filter.ALL, today, 3))
        assertFalse(inactive.matches(Filter.EXPIRED, today, 3))
        assertTrue(inactive.matches(Filter.INACTIVE, today, 3))
    }

    @Test
    fun normalizaNumerosDeWhatsApp() {
        assertEquals("573001234567", WhatsApp.normalize("300 123 4567", "57"))
        assertEquals("573001234567", WhatsApp.normalize("+57 300-123-4567", "57"))
        assertEquals("5215512345678", WhatsApp.normalize("+52 1 55 1234 5678", "57"))
        assertEquals("5215512345678", WhatsApp.normalize("0052 1 55 1234 5678", "57"))
        assertEquals("", WhatsApp.normalize("  ", "57"))
    }

    @Test
    fun plantillaOmiteLineasVacias() {
        val item = Item(
            name = "Netflix",
            plan = "Perfil",
            accessUser = "cuenta@correo.com",
            accessPassword = "clave123",
            status = ItemStatus.SOLD,
        )
        val text = Messages.fill(
            "Hola {cliente}\nUsuario: {usuario}\nClave: {clave}\nPIN: {perfil}\nVence: {vence}\n{negocio}",
            item,
            Client(name = "Ana"),
            AppSettings(businessName = "Tienda"),
            today,
        )
        assertEquals("Hola Ana\nUsuario: cuenta@correo.com\nClave: clave123\nTienda", text)
    }
}

class StockTest {
    private val today = 20_000L
    private val account = Item(id = 1, name = "Netflix", kind = ItemKind.ACCOUNT, expirationDate = today + 30)
    private fun profile(id: Long, status: String = ItemStatus.AVAILABLE) =
        Item(id = id, name = "Netflix", kind = ItemKind.PROFILE, parentId = 1, status = status, expirationDate = today + 30, createdAt = id)

    @Test
    fun cuentaLibreSeVendeCompletaOPorPerfil() {
        val stock = Stock(listOf(account, profile(2), profile(3)))
        assertEquals(listOf(1L), stock.visible.map { it.id })
        assertEquals(2, stock.freeProfiles(account).size)
        assertTrue(stock.canSellFull(account))
        assertTrue(stock.matches(account, Filter.AVAILABLE, today, 3))
    }

    @Test
    fun perfilVendidoBloqueaVentaCompletaYApareceEnLista() {
        val sold = profile(3, ItemStatus.SOLD)
        val stock = Stock(listOf(account, profile(2), sold))
        assertFalse(stock.canSellFull(account))
        assertEquals(listOf(2L), stock.freeProfiles(account).map { it.id })
        assertEquals(setOf(1L, 3L), stock.visible.map { it.id }.toSet())
    }

    @Test
    fun cuentaCompletaVendidaNoTienePerfilesLibres() {
        val stock = Stock(listOf(account.copy(status = ItemStatus.SOLD), profile(2), profile(3)))
        assertTrue(stock.freeProfiles(stock.all.first()).isEmpty())
    }

    @Test
    fun cuentaSinPerfilesLibresNoCuentaComoDisponible() {
        val stock = Stock(listOf(account, profile(2, ItemStatus.SOLD)))
        assertFalse(stock.matches(account, Filter.AVAILABLE, today, 3))
    }
}
