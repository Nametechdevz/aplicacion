package com.nametech.inventario.data

import android.content.Context
import android.net.Uri
import com.nametech.inventario.domain.Category
import com.nametech.inventario.util.Fmt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Respaldo completo en JSON y exportación a CSV (se abre en Excel / Google Sheets). */
class BackupManager(private val context: Context, private val repo: InventoryRepository) {

    suspend fun exportJson(uri: Uri) = withContext(Dispatchers.IO) {
        val root = JSONObject()
            .put("app", "inventario-pro")
            .put("version", 1)
            .put("exportedAt", System.currentTimeMillis())
            .put("items", JSONArray(repo.allItems().map { it.toJson() }))
            .put("clients", JSONArray(repo.allClients().map { it.toJson() }))
            .put("sales", JSONArray(repo.allSales().map { it.toJson() }))
        write(uri, root.toString(2))
    }

    /** Reemplaza todos los datos por los del respaldo. Devuelve cuántos productos importó. */
    suspend fun importJson(uri: Uri): Int = withContext(Dispatchers.IO) {
        val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
            ?: error("No se pudo leer el archivo")
        val root = JSONObject(text)
        require(root.optString("app") == "inventario-pro") { "El archivo no es un respaldo de Inventario Pro" }
        val items = root.getJSONArray("items").objects().map { it.toItem() }
        val clients = root.getJSONArray("clients").objects().map { it.toClient() }
        val sales = root.optJSONArray("sales")?.objects()?.map { it.toSale() }.orEmpty()
        repo.replaceAll(items, clients, sales)
        items.size
    }

    suspend fun exportItemsCsv(uri: Uri) = withContext(Dispatchers.IO) {
        val clients = repo.allClients().associateBy { it.id }
        val header = listOf(
            "ID", "Categoría", "Servicio", "Plan", "Usuario", "Clave", "Perfil/PIN", "Link", "Proveedor",
            "Costo", "Precio sugerido", "Fecha compra", "Vence cuenta", "Estado", "Cliente", "WhatsApp",
            "Fecha venta", "Precio venta", "Vence cliente", "Pagado", "Notas",
        )
        val rows = repo.allItems().map { i ->
            val c = i.clientId?.let { clients[it] }
            listOf(
                i.id.toString(), Category.of(i.category).label, i.name, i.plan, i.accessUser, i.accessPassword,
                i.profilePin, i.accessUrl, i.supplier, Fmt.plain(i.costPrice), Fmt.plain(i.suggestedPrice),
                Fmt.date(i.purchaseDate), Fmt.date(i.expirationDate), statusLabel(i.status), c?.name.orEmpty(),
                c?.whatsapp.orEmpty(), Fmt.date(i.saleDate), Fmt.plain(i.salePrice), Fmt.date(i.clientExpirationDate),
                if (i.status == ItemStatus.SOLD) (if (i.paid) "Sí" else "No") else "", i.notes,
            )
        }
        write(uri, csv(header, rows))
    }

    suspend fun exportSalesCsv(uri: Uri) = withContext(Dispatchers.IO) {
        val header = listOf("Fecha", "Tipo", "Producto", "Categoría", "Cliente", "Valor", "Costo", "Ganancia")
        val rows = repo.allSales().sortedByDescending { it.date }.map { s ->
            listOf(
                Fmt.date(s.date), if (s.kind == SaleKind.SALE) "Venta" else "Renovación", s.itemName,
                Category.of(s.category).label, s.clientName, Fmt.plain(s.amount), Fmt.plain(s.cost),
                Fmt.plain(s.amount - s.cost),
            )
        }
        write(uri, csv(header, rows))
    }

    private fun write(uri: Uri, text: String) {
        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
            ?: error("No se pudo escribir el archivo")
    }

    private fun csv(header: List<String>, rows: List<List<String>>): String {
        fun esc(v: String) = if (v.any { it == ';' || it == '"' || it == '\n' }) "\"" + v.replace("\"", "\"\"") + "\"" else v
        // BOM + punto y coma: Excel en español lo abre en columnas directamente.
        return "﻿" + (listOf(header) + rows).joinToString("\r\n") { r -> r.joinToString(";") { esc(it) } }
    }

    private fun statusLabel(s: String) = when (s) {
        ItemStatus.AVAILABLE -> "Disponible"
        ItemStatus.SOLD -> "Vendida"
        else -> "Inactiva"
    }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

private fun JSONObject.optLongOrNull(key: String): Long? = if (isNull(key) || !has(key)) null else getLong(key)

private fun Item.toJson() = JSONObject()
    .put("id", id).put("category", category).put("name", name).put("plan", plan)
    .put("accessUser", accessUser).put("accessPassword", accessPassword).put("profilePin", profilePin)
    .put("accessUrl", accessUrl).put("extraInfo", extraInfo).put("supplier", supplier)
    .put("costPrice", costPrice).put("suggestedPrice", suggestedPrice)
    .put("purchaseDate", purchaseDate ?: JSONObject.NULL).put("expirationDate", expirationDate ?: JSONObject.NULL)
    .put("status", status).put("clientId", clientId ?: JSONObject.NULL).put("saleDate", saleDate ?: JSONObject.NULL)
    .put("salePrice", salePrice).put("clientExpirationDate", clientExpirationDate ?: JSONObject.NULL)
    .put("paid", paid).put("lastReminderAt", lastReminderAt ?: JSONObject.NULL).put("notes", notes)
    .put("createdAt", createdAt).put("updatedAt", updatedAt)

private fun JSONObject.toItem() = Item(
    id = getLong("id"), category = optString("category", "OTRO"), name = optString("name"), plan = optString("plan"),
    accessUser = optString("accessUser"), accessPassword = optString("accessPassword"),
    profilePin = optString("profilePin"), accessUrl = optString("accessUrl"), extraInfo = optString("extraInfo"),
    supplier = optString("supplier"), costPrice = optDouble("costPrice", 0.0),
    suggestedPrice = optDouble("suggestedPrice", 0.0), purchaseDate = optLongOrNull("purchaseDate"),
    expirationDate = optLongOrNull("expirationDate"), status = optString("status", ItemStatus.AVAILABLE),
    clientId = optLongOrNull("clientId"), saleDate = optLongOrNull("saleDate"),
    salePrice = optDouble("salePrice", 0.0), clientExpirationDate = optLongOrNull("clientExpirationDate"),
    paid = optBoolean("paid", true), lastReminderAt = optLongOrNull("lastReminderAt"), notes = optString("notes"),
    createdAt = optLong("createdAt", System.currentTimeMillis()),
    updatedAt = optLong("updatedAt", System.currentTimeMillis()),
)

private fun Client.toJson() = JSONObject()
    .put("id", id).put("name", name).put("whatsapp", whatsapp).put("email", email).put("notes", notes)
    .put("createdAt", createdAt)

private fun JSONObject.toClient() = Client(
    id = getLong("id"), name = optString("name"), whatsapp = optString("whatsapp"), email = optString("email"),
    notes = optString("notes"), createdAt = optLong("createdAt", System.currentTimeMillis()),
)

private fun Sale.toJson() = JSONObject()
    .put("id", id).put("itemId", itemId ?: JSONObject.NULL).put("clientId", clientId ?: JSONObject.NULL)
    .put("itemName", itemName).put("clientName", clientName).put("category", category)
    .put("amount", amount).put("cost", cost).put("date", date).put("kind", kind).put("createdAt", createdAt)

private fun JSONObject.toSale() = Sale(
    id = getLong("id"), itemId = optLongOrNull("itemId"), clientId = optLongOrNull("clientId"),
    itemName = optString("itemName"), clientName = optString("clientName"), category = optString("category"),
    amount = optDouble("amount", 0.0), cost = optDouble("cost", 0.0), date = optLong("date"),
    kind = optString("kind", SaleKind.SALE), createdAt = optLong("createdAt", System.currentTimeMillis()),
)
