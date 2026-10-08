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

    /** Copia de seguridad automática dentro de la app (antes de reemplazar datos al conectar). */
    suspend fun exportJsonToFile(name: String): java.io.File = withContext(Dispatchers.IO) {
        val dir = java.io.File(context.filesDir, "respaldos").apply { mkdirs() }
        val file = java.io.File(dir, name)
        val root = JSONObject()
            .put("app", "inventario-pro")
            .put("version", 1)
            .put("exportedAt", System.currentTimeMillis())
            .put("items", JSONArray(repo.allItems().map { it.toJson() }))
            .put("clients", JSONArray(repo.allClients().map { it.toJson() }))
            .put("sales", JSONArray(repo.allSales().map { it.toJson() }))
        file.writeText(root.toString(2))
        file
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
            "ID", "Tipo", "Cuenta (ID)", "Categoría", "Servicio", "Plan", "Usuario", "Clave", "Perfil/PIN", "Link", "Proveedor",
            "Costo", "Precio sugerido", "Fecha compra", "Vence cuenta", "Estado", "Cliente", "WhatsApp",
            "Fecha venta", "Precio venta", "Vence cliente", "Pagado", "Notas",
        )
        val rows = repo.allItems().map { i ->
            val c = i.clientId?.let { clients[it] }
            listOf(
                i.id.toString(), kindLabel(i.kind), i.parentId?.toString().orEmpty(), Category.of(i.category).label, i.name, i.plan, i.accessUser, i.accessPassword,
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

    private fun kindLabel(k: String) = when (k) {
        ItemKind.ACCOUNT -> "Cuenta completa"
        ItemKind.PROFILE -> "Perfil"
        else -> "Individual"
    }

    private fun statusLabel(s: String) = when (s) {
        ItemStatus.AVAILABLE -> "Disponible"
        ItemStatus.SOLD -> "Vendida"
        else -> "Inactiva"
    }
}
