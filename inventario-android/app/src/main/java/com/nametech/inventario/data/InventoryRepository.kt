package com.nametech.inventario.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow

/**
 * Operaciones del inventario. Cada operación arma un [ChangeSet]: sin servidor se guarda directo
 * en el teléfono; con servidor se envía primero (en una transacción) y luego se guarda la versión
 * que devuelve el servidor, así todos los dispositivos del usuario quedan iguales.
 */
class InventoryRepository(
    private val db: AppDatabase,
    private val cloud: CloudClient,
    private val settings: SettingsRepository,
) {
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
    suspend fun countItems() = itemDao.count()

    /** Guarda los cambios (en el servidor si hay sesión). */
    private suspend fun commit(cs: ChangeSet) {
        if (!settings.current.isCloud) {
            applyLocal(cs.items, cs.clients, cs.sales, cs.deleteItems, cs.deleteClients, cs.deleteSales)
            return
        }
        val result = cloud.commit(cs)
        applyLocal(result.items, result.clients, result.sales, cs.deleteItems, cs.deleteClients, cs.deleteSales)
    }

    private suspend fun applyLocal(
        items: List<Item>,
        clients: List<Client>,
        sales: List<Sale>,
        deleteItems: List<Long>,
        deleteClients: List<Long>,
        deleteSales: List<Long>,
    ) = db.withTransaction {
        if (clients.isNotEmpty()) clientDao.upsert(clients)
        if (items.isNotEmpty()) itemDao.upsert(items)
        if (sales.isNotEmpty()) saleDao.upsert(sales)
        if (deleteSales.isNotEmpty()) saleDao.deleteIds(deleteSales)
        if (deleteItems.isNotEmpty()) itemDao.deleteIds(deleteItems)
        if (deleteClients.isNotEmpty()) clientDao.deleteIds(deleteClients)
    }

    // ------------------------------------------------------------ sincronización

    /** Trae los cambios hechos desde otros dispositivos. Con since=0 reemplaza todo lo local. */
    suspend fun pull(): SyncResult {
        val since = settings.current.lastRev
        val r = cloud.sync(since)
        db.withTransaction {
            if (since == 0L) {
                saleDao.clear()
                itemDao.clear()
                clientDao.clear()
            }
            applyLocal(r.items, r.clients, r.sales, r.deletedItems, r.deletedClients, r.deletedSaleIds)
        }
        settings.update { s ->
            val base = s.copy(
                lastRev = r.rev,
                lastSyncAt = System.currentTimeMillis(),
                userName = r.user.name,
                userRole = r.user.role,
                accessExpiresAt = r.user.expiresAt,
            )
            if (r.brand != null) base.withBrand(r.brand) else base
        }
        return r
    }

    /** Sube los datos de este teléfono a una cuenta vacía del servidor. */
    suspend fun uploadLocalData(base: String, token: String) {
        cloud.import(allItems(), allClients(), allSales(), settings.current.brandJson(), base, token)
    }

    suspend fun clearLocal() = db.withTransaction {
        saleDao.clear()
        itemDao.clear()
        clientDao.clear()
    }

    // ------------------------------------------------------------ productos

    /** Datos de la cuenta que comparten todos sus perfiles. */
    private fun Item.withAccountData(account: Item) = copy(
        category = account.category,
        name = account.name,
        plan = account.plan,
        accessUser = account.accessUser,
        accessPassword = account.accessPassword,
        accessUrl = account.accessUrl,
        extraInfo = account.extraInfo,
        supplier = account.supplier,
        purchaseDate = account.purchaseDate,
        expirationDate = account.expirationDate,
    )

    /** Si cambia la clave, el correo o el vencimiento de la cuenta, se copia a sus perfiles. */
    private suspend fun syncProfiles(cs: ChangeSet, account: Item) {
        val now = System.currentTimeMillis()
        itemDao.profilesOf(account.id).forEach { p -> cs.put(p.withAccountData(account).copy(updatedAt = now), p) }
    }

    /**
     * Crea o actualiza un producto. Al crear con [copies] > 1 se generan varias unidades iguales;
     * si no tienen perfil se numeran solas.
     */
    suspend fun saveItem(item: Item, copies: Int = 1): Long {
        val now = System.currentTimeMillis()
        val cs = ChangeSet()
        val id: Long
        if (item.id != 0L) {
            id = item.id
            val updated = item.copy(updatedAt = now)
            cs.put(updated, itemDao.get(item.id))
            if (item.isAccount) syncProfiles(cs, updated)
        } else if (copies <= 1) {
            id = newId()
            cs.put(item.copy(id = id, createdAt = now, updatedAt = now))
        } else {
            id = newId()
            for (i in 1..copies) {
                val profile = item.profilePin.ifBlank { "Perfil $i" }
                cs.put(item.copy(id = if (i == 1) id else newId(), profilePin = profile, createdAt = now + i, updatedAt = now + i))
            }
        }
        commit(cs)
        return id
    }

    /**
     * Crea una cuenta completa con sus perfiles. [profiles] = nombre/PIN y precio de cada perfil.
     * El costo de la cuenta se reparte entre los perfiles para calcular la ganancia por perfil.
     */
    suspend fun createAccount(account: Item, profiles: List<Pair<String, Double>>): Long {
        val now = System.currentTimeMillis()
        val parent = account.copy(id = newId(), kind = ItemKind.ACCOUNT, parentId = null, createdAt = now, updatedAt = now)
        val cs = ChangeSet()
        cs.put(parent)
        val unitCost = if (profiles.isEmpty()) 0.0 else account.costPrice / profiles.size
        profiles.forEachIndexed { i, (label, price) ->
            cs.put(
                Item(
                    id = newId(),
                    kind = ItemKind.PROFILE,
                    parentId = parent.id,
                    profilePin = label.ifBlank { "Perfil ${i + 1}" },
                    suggestedPrice = price,
                    costPrice = unitCost,
                    createdAt = now + i + 1,
                    updatedAt = now + i + 1,
                ).withAccountData(parent),
            )
        }
        commit(cs)
        return parent.id
    }

    suspend fun addProfile(account: Item, label: String, price: Double) {
        val count = itemDao.profilesOf(account.id).size
        val now = System.currentTimeMillis()
        val cs = ChangeSet()
        cs.read(account)
        cs.put(
            Item(
                id = newId(),
                kind = ItemKind.PROFILE,
                parentId = account.id,
                profilePin = label.ifBlank { "Perfil ${count + 1}" },
                suggestedPrice = price,
                createdAt = now,
                updatedAt = now,
            ).withAccountData(account),
        )
        commit(cs)
    }

    suspend fun duplicate(item: Item, copies: Int): Long {
        fun Item.fresh(newId: Long, parent: Long?, t: Long) = copy(
            id = newId, parentId = parent, status = ItemStatus.AVAILABLE, clientId = null, saleDate = null,
            salePrice = 0.0, clientExpirationDate = null, paid = true, lastReminderAt = null,
            createdAt = t, updatedAt = t, rev = 0,
        )
        val cs = ChangeSet()
        val now = System.currentTimeMillis()
        val profiles = if (item.isAccount) itemDao.profilesOf(item.id) else emptyList()
        var firstId = 0L
        repeat(copies) { i ->
            val id = newId()
            if (i == 0) firstId = id
            cs.put(item.fresh(id, item.parentId, now + i))
            profiles.forEachIndexed { j, p -> cs.put(p.fresh(newId(), id, now + i + j + 1)) }
        }
        commit(cs)
        return firstId
    }

    /** No se pudo vender porque cambió el estado (otro dispositivo, cuenta ya vendida, etc.). */
    class NotAvailableException(message: String) : Exception(message)

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
    ): Pair<Item, Client> {
        val item = itemDao.get(itemId) ?: throw NotAvailableException("El producto ya no existe")
        val cs = ChangeSet()
        val wasSold = item.status == ItemStatus.SOLD
        if (item.isAccount && !wasSold) {
            val profiles = itemDao.profilesOf(item.id)
            if (profiles.any { it.status == ItemStatus.SOLD }) {
                throw NotAvailableException("La cuenta completa no se puede vender: ya tiene perfiles vendidos")
            }
            profiles.forEach { cs.read(it) }
        }
        if (item.isProfile && !wasSold) {
            val parent = item.parentId?.let { itemDao.get(it) }
            if (parent?.status == ItemStatus.SOLD) throw NotAvailableException("La cuenta completa ya está vendida")
            parent?.let { cs.read(it) }
        }
        val client = if (clientId != null) {
            clientDao.get(clientId) ?: throw NotAvailableException("El cliente ya no existe")
        } else {
            Client(id = newId(), name = newClientName.trim(), whatsapp = newClientPhone.trim()).also { cs.put(it) }
        }

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
        cs.put(updated, item)
        if (!wasSold) {
            cs.put(
                Sale(
                    id = newId(),
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
        commit(cs)
        return (itemDao.get(item.id) ?: updated) to client
    }

    /** Renueva: extiende el vencimiento del cliente y/o de la cuenta, y registra el cobro. */
    suspend fun renew(
        item: Item,
        newClientExpiration: Long?,
        newAccountExpiration: Long?,
        amount: Double,
        cost: Double,
        date: Long,
    ) {
        val cs = ChangeSet()
        val updated = item.copy(
            clientExpirationDate = if (item.status == ItemStatus.SOLD) newClientExpiration else item.clientExpirationDate,
            expirationDate = newAccountExpiration,
            lastReminderAt = null,
            updatedAt = System.currentTimeMillis(),
        )
        cs.put(updated, item)
        if (item.isAccount) syncProfiles(cs, updated)
        if (amount > 0 || cost > 0) {
            val client = item.clientId?.let { clientDao.get(it) }
            cs.put(
                Sale(
                    id = newId(),
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
        commit(cs)
    }

    private fun Item.released() = copy(
        status = ItemStatus.AVAILABLE,
        clientId = null,
        saleDate = null,
        salePrice = 0.0,
        clientExpirationDate = null,
        paid = true,
        lastReminderAt = null,
        updatedAt = System.currentTimeMillis(),
    )

    /** Devuelve el producto a disponible (el cliente dejó el servicio). */
    suspend fun release(item: Item) = commit(ChangeSet().apply { put(item.released(), item) })

    suspend fun setInactive(item: Item, inactive: Boolean) {
        val updated = if (inactive) {
            item.copy(status = ItemStatus.INACTIVE, clientId = null, clientExpirationDate = null, updatedAt = System.currentTimeMillis())
        } else {
            item.copy(status = ItemStatus.AVAILABLE, updatedAt = System.currentTimeMillis())
        }
        commit(ChangeSet().apply { put(updated, item) })
    }

    suspend fun markReminded(item: Item) =
        commit(ChangeSet().apply { put(item.copy(lastReminderAt = System.currentTimeMillis()), item) })

    suspend fun setPaid(item: Item, paid: Boolean) =
        commit(ChangeSet().apply { put(item.copy(paid = paid, updatedAt = System.currentTimeMillis()), item) })

    /** Elimina el producto; si es una cuenta completa, también sus perfiles. El historial se conserva. */
    suspend fun deleteItem(item: Item) {
        val cs = ChangeSet()
        val toDelete = if (item.isAccount) itemDao.profilesOf(item.id) + item else listOf(item)
        val ids = toDelete.map { it.id }.toSet()
        toDelete.forEach { cs.delete(it) }
        saleDao.getAll().filter { it.itemId in ids }.forEach { cs.put(it.copy(itemId = null)) }
        commit(cs)
    }

    // ------------------------------------------------------------ clientes

    suspend fun saveClient(client: Client): Long {
        val c = if (client.id == 0L) client.copy(id = newId()) else client
        commit(ChangeSet().apply { put(c) })
        return c.id
    }

    /** Elimina el cliente y libera los productos que tenía asignados. */
    suspend fun deleteClient(client: Client) {
        val cs = ChangeSet()
        itemDao.getAll().filter { it.clientId == client.id }.forEach { cs.put(it.released(), it) }
        saleDao.getAll().filter { it.clientId == client.id }.forEach { cs.put(it.copy(clientId = null)) }
        cs.deleteClients += client.id
        commit(cs)
    }

    /** Restaurar respaldo (solo en modo teléfono). */
    suspend fun replaceAll(items: List<Item>, clients: List<Client>, sales: List<Sale>) = db.withTransaction {
        saleDao.clear()
        itemDao.clear()
        clientDao.clear()
        clientDao.insertAll(clients)
        itemDao.insertAll(items)
        saleDao.insertAll(sales)
    }
}

fun Item.displayName(): String {
    val base = if (plan.isBlank()) name else "$name - $plan"
    return when {
        isProfile && profilePin.isNotBlank() -> "$base ($profilePin)"
        isAccount -> "$base (cuenta completa)"
        else -> base
    }
}
