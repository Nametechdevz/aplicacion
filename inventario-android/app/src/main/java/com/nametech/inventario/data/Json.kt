package com.nametech.inventario.data

import org.json.JSONArray
import org.json.JSONObject

/** Conversión de los registros a JSON (respaldos y servidor). Los nombres coinciden con el servidor. */
fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

fun JSONObject.optLongOrNull(key: String): Long? = if (isNull(key)) null else optLong(key)

fun Item.toJson() = JSONObject()
    .put("id", id).put("category", category).put("name", name).put("plan", plan)
    .put("accessUser", accessUser).put("accessPassword", accessPassword).put("profilePin", profilePin)
    .put("accessUrl", accessUrl).put("extraInfo", extraInfo).put("supplier", supplier)
    .put("costPrice", costPrice).put("suggestedPrice", suggestedPrice)
    .put("purchaseDate", purchaseDate ?: JSONObject.NULL).put("expirationDate", expirationDate ?: JSONObject.NULL)
    .put("status", status).put("clientId", clientId ?: JSONObject.NULL).put("saleDate", saleDate ?: JSONObject.NULL)
    .put("salePrice", salePrice).put("clientExpirationDate", clientExpirationDate ?: JSONObject.NULL)
    .put("paid", paid).put("lastReminderAt", lastReminderAt ?: JSONObject.NULL).put("notes", notes)
    .put("createdAt", createdAt).put("updatedAt", updatedAt)
    .put("kind", kind).put("parentId", parentId ?: JSONObject.NULL).put("rev", rev)

fun JSONObject.toItem() = Item(
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
    kind = optString("kind", ItemKind.SINGLE), parentId = optLongOrNull("parentId"), rev = optLong("rev", 0),
)

fun Client.toJson() = JSONObject()
    .put("id", id).put("name", name).put("whatsapp", whatsapp).put("email", email).put("notes", notes)
    .put("createdAt", createdAt).put("rev", rev)

fun JSONObject.toClient() = Client(
    id = getLong("id"), name = optString("name"), whatsapp = optString("whatsapp"), email = optString("email"),
    notes = optString("notes"), createdAt = optLong("createdAt", System.currentTimeMillis()), rev = optLong("rev", 0),
)

fun Sale.toJson() = JSONObject()
    .put("id", id).put("itemId", itemId ?: JSONObject.NULL).put("clientId", clientId ?: JSONObject.NULL)
    .put("itemName", itemName).put("clientName", clientName).put("category", category)
    .put("amount", amount).put("cost", cost).put("date", date).put("kind", kind).put("createdAt", createdAt)
    .put("createdBy", createdBy).put("rev", rev)

fun JSONObject.toSale() = Sale(
    id = getLong("id"), itemId = optLongOrNull("itemId"), clientId = optLongOrNull("clientId"),
    itemName = optString("itemName"), clientName = optString("clientName"), category = optString("category"),
    amount = optDouble("amount", 0.0), cost = optDouble("cost", 0.0), date = optLong("date"),
    kind = optString("kind", SaleKind.SALE), createdAt = optLong("createdAt", System.currentTimeMillis()),
    createdBy = optString("createdBy"), rev = optLong("rev", 0),
)
