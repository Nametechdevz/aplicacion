package com.nametech.inventario.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow

class InventoryRepository(private val db: AppDatabase) {
    private val itemDao = db.items()
    private val clientDao = db.clients()
    private val saleDao = db.sales()

    val items: Flow<List<Item>> = itemDao.observeAll()
    val clients: Flow<List<Client>> = clientDao.observeAll()
    val sales: Flow<List<Sale>> = saleDao.observeAll()

    suspend fun getItem(id: Long) = itemDao.get(id)
    suspend fun getClient(id: Long) = clientDao.get(id)
    suspend fun allItems() = itemDao.getAll()
    suspend fun allClients() = clientDao.getAll()
    suspend fun allSales() = saleDao.getAll()

    /**
     * Crea o actualiza un producto. Al crear con [copies] > 1 se generan varias unidades
     * (p. ej. los perfiles de una misma cuenta); si no tienen perfil se numeran solas.
     */
    suspend fun saveItem(item: Item, copies: Int = 1): Long {
        val now = System.currentTimeMillis()
        if (item.id != 0L) {
            itemDao.update(item.copy(updatedAt = now))
            return item.id
        }
        if (copies <= 1) return itemDao.insert(item.copy(createdAt = now, updatedAt = now))
        var firstId = 0L
        db.withTransaction {
            for (i in 1..copies) {
                val profile = item.profilePin.ifBlank { "Perfil $i" }
                val id = itemDao.insert(item.copy(profilePin = profile, createdAt = now + i, updatedAt = now + i))
                if (i == 1) firstId = id
            }
        }
        return firstId
    }

    suspend fun duplicate(item: Item, copies: Int): Long {
        val base = item.copy(
            id = 0,
            status = ItemStatus.AVAILABLE,
            clientId = null,
            saleDate = null,
            salePrice = 0.0,
            clientExpirationDate = null,
            paid = true,
            lastReminderAt = null,
        )
        var firstId = 0L
        db.withTransaction {
            val now = System.currentTimeMillis()
            repeat(copies) { i ->
                val id = itemDao.insert(base.copy(createdAt = now + i, updatedAt = now + i))
                if (i == 0) firstId = id
            }
        }
        return firstId
    }

    /**
     * Vende un producto (o edita la venta si ya estaba vendido).
     * Si [clientId] es null se crea un cliente nuevo con [newClientName]/[newClientPhone].
     */
    suspend fun sell(
        itemId: Long,
        clientId: Long?,
        newClientName: String,
        newClientPhone: String,
        saleDate: Long,
        price: Double,
        clientExpiration: Long?,
        paid: Boolean,
    ): Pair<Item, Client>? = db.withTransaction {
        val item = itemDao.get(itemId) ?: return@withTransaction null
        val client = if (clientId != null) {
            clientDao.get(clientId)
        } else {
            val c = Client(name = newClientName.trim(), whatsapp = newClientPhone.trim())
            c.copy(id = clientDao.insert(c))
        } ?: return@withTransaction null

        val wasSold = item.status == ItemStatus.SOLD
        val updated = item.copy(
            status = ItemStatus.SOLD,
            clientId = client.id,
            saleDate = saleDate,
            salePrice = price,
            clientExpirationDate = clientExpiration,
            paid = paid,
            lastReminderAt = if (wasSold) item.lastReminderAt else null,
            updatedAt = System.currentTimeMillis(),
        )
        itemDao.update(updated)
        if (!wasSold) {
            saleDao.insert(
                Sale(
                    itemId = item.id,
                    clientId = client.id,
                    itemName = item.displayName(),
                    clientName = client.name,
                    category = item.category,
                    amount = price,
                    cost = item.costPrice,
                    date = saleDate,
                    kind = SaleKind.SALE,
                ),
            )
        }
        updated to client
    }

    /** Renueva: extiende el vencimiento del cliente y/o de la cuenta, y registra el cobro. */
    suspend fun renew(
        item: Item,
        newClientExpiration: Long?,
        newAccountExpiration: Long?,
        amount: Double,
        cost: Double,
        date: Long,
    ) = db.withTransaction {
        val updated = item.copy(
            clientExpirationDate = if (item.status == ItemStatus.SOLD) newClientExpiration else item.clientExpirationDate,
            expirationDate = newAccountExpiration,
            lastReminderAt = null,
            updatedAt = System.currentTimeMillis(),
        )
        itemDao.update(updated)
        if (amount > 0 || cost > 0) {
            val client = item.clientId?.let { clientDao.get(it) }
            saleDao.insert(
                Sale(
                    itemId = item.id,
                    clientId = client?.id,
                    itemName = item.displayName(),
                    clientName = client?.name.orEmpty(),
                    category = item.category,
                    amount = amount,
                    cost = cost,
                    date = date,
                    kind = SaleKind.RENEWAL,
                ),
            )
        }
    }

    /** Devuelve el producto a disponible (el cliente dejó el servicio). */
    suspend fun release(item: Item) = itemDao.update(
        item.copy(
            status = ItemStatus.AVAILABLE,
            clientId = null,
            saleDate = null,
            salePrice = 0.0,
            clientExpirationDate = null,
            paid = true,
            lastReminderAt = null,
            updatedAt = System.currentTimeMillis(),
        ),
    )

    suspend fun setInactive(item: Item, inactive: Boolean) {
        if (inactive) {
            itemDao.update(
                item.copy(
                    status = ItemStatus.INACTIVE,
                    clientId = null,
                    clientExpirationDate = null,
                    updatedAt = System.currentTimeMillis(),
                ),
            )
        } else {
            itemDao.update(item.copy(status = ItemStatus.AVAILABLE, updatedAt = System.currentTimeMillis()))
        }
    }

    suspend fun markReminded(item: Item) =
        itemDao.update(item.copy(lastReminderAt = System.currentTimeMillis()))

    suspend fun setPaid(item: Item, paid: Boolean) =
        itemDao.update(item.copy(paid = paid, updatedAt = System.currentTimeMillis()))

    suspend fun deleteItem(item: Item) = db.withTransaction {
        saleDao.detachItem(item.id)
        itemDao.delete(item)
    }

    suspend fun saveClient(client: Client): Long =
        if (client.id == 0L) clientDao.insert(client) else client.id.also { clientDao.update(client) }

    /** Elimina el cliente y libera los productos que tenía asignados. */
    suspend fun deleteClient(client: Client) = db.withTransaction {
        itemDao.getAll().filter { it.clientId == client.id }.forEach { release(it) }
        saleDao.detachClient(client.id)
        clientDao.delete(client)
    }

    suspend fun deleteSale(sale: Sale) = saleDao.delete(sale)

    suspend fun replaceAll(items: List<Item>, clients: List<Client>, sales: List<Sale>) = db.withTransaction {
        saleDao.clear()
        itemDao.clear()
        clientDao.clear()
        clientDao.insertAll(clients)
        itemDao.insertAll(items)
        saleDao.insertAll(sales)
    }
}

fun Item.displayName(): String = if (plan.isBlank()) name else "$name - $plan"
