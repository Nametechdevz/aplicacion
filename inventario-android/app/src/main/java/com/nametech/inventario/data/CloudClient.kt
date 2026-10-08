package com.nametech.inventario.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Error al hablar con el servidor. [code] = 0 sin conexión; 401/402 = sesión inválida o acceso vencido. */
class CloudException(message: String, val code: Int) : Exception(message) {
    val sessionLost: Boolean get() = code == 401 || code == 402
}

data class CloudUser(
    val id: Long,
    val name: String,
    val username: String,
    val phone: String,
    val role: String,
    val active: Boolean,
    val expiresAt: Long,
    val lastLogin: Long,
    val itemCount: Int,
) {
    val isAdmin: Boolean get() = role == "ADMIN"

    companion object {
        fun from(j: JSONObject) = CloudUser(
            id = j.optLong("id"),
            name = j.optString("name"),
            username = j.optString("username"),
            phone = j.optString("phone"),
            role = j.optString("role"),
            active = j.optBoolean("active", true),
            expiresAt = j.optLong("expiresAt"),
            lastLogin = j.optLong("lastLogin"),
            itemCount = j.optInt("itemCount"),
        )
    }
}

data class AppRelease(val versionCode: Int, val versionName: String, val notes: String, val url: String)

data class ActivityEntry(val userName: String, val action: String, val createdAt: Long)

/** Lote de cambios que se envía en una sola transacción. */
class ChangeSet {
    val items = mutableListOf<Item>()
    val clients = mutableListOf<Client>()
    val sales = mutableListOf<Sale>()
    val deleteItems = mutableListOf<Long>()
    val deleteClients = mutableListOf<Long>()
    val deleteSales = mutableListOf<Long>()

    /** Revisión conocida de cada producto leído o cambiado (0 = nuevo). */
    val expect = mutableMapOf<Long, Long>()

    fun put(item: Item, known: Item? = null) {
        items.removeAll { it.id == item.id }
        items += item
        if (!expect.containsKey(item.id)) expect[item.id] = known?.rev ?: item.rev
    }

    /** Marca que la operación depende de este producto aunque no lo cambie. */
    fun read(item: Item) {
        if (!expect.containsKey(item.id)) expect[item.id] = item.rev
    }

    fun put(client: Client) {
        clients.removeAll { it.id == client.id }
        clients += client
    }

    fun put(sale: Sale) {
        sales.removeAll { it.id == sale.id }
        sales += sale
    }

    fun delete(item: Item) {
        read(item)
        deleteItems += item.id
    }

    fun toJson(): JSONObject = JSONObject()
        .put("expect", JSONObject().put("items", JSONObject().apply { expect.forEach { (k, v) -> put(k.toString(), v) } }))
        .put(
            "upsert",
            JSONObject()
                .put("items", JSONArray(items.map { it.toJson() }))
                .put("clients", JSONArray(clients.map { it.toJson() }))
                .put("sales", JSONArray(sales.map { it.toJson() })),
        )
        .put(
            "delete",
            JSONObject()
                .put("items", JSONArray(deleteItems))
                .put("clients", JSONArray(deleteClients))
                .put("sales", JSONArray(deleteSales)),
        )
}

class SyncResult(
    val rev: Long,
    val user: CloudUser,
    val items: List<Item>,
    val clients: List<Client>,
    val sales: List<Sale>,
    val deletedItems: List<Long>,
    val deletedClients: List<Long>,
    val deletedSaleIds: List<Long>,
    val brand: JSONObject?,
)

class CommitResult(val items: List<Item>, val clients: List<Client>, val sales: List<Sale>)

/** Cliente HTTP del servidor propio (PHP + MySQL en el hosting). */
class CloudClient(private val settings: SettingsRepository) {

    companion object {
        /** Acepta "midominio.com/inventario", con o sin https:// y con o sin /api.php. */
        fun apiUrl(base: String): String {
            var url = base.trim().trimEnd('/')
            if (!url.contains("://")) url = "https://$url"
            if (url.endsWith("/install.php") || url.endsWith("/index.php")) url = url.substringBeforeLast('/')
            return if (url.endsWith(".php")) url else "$url/api.php"
        }
    }

    private suspend fun request(
        route: String,
        body: JSONObject? = null,
        base: String = settings.current.serverUrl,
        token: String = settings.current.authToken,
    ): JSONObject = withContext(Dispatchers.IO) {
        try {
            val conn = URL(apiUrl(base) + "?r=" + route).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("Accept", "application/json")
            if (token.isNotEmpty()) conn.setRequestProperty("X-Auth-Token", token)
            if (body != null) {
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val text = (if (code < 400) conn.inputStream else conn.errorStream)
                ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            conn.disconnect()
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (code >= 400 || json == null) {
                val msg = json?.optString("error")?.takeIf { it.isNotBlank() }
                    ?: if (json == null) "La dirección no corresponde a un servidor de Inventario Pro ($code)" else "Error del servidor ($code)"
                throw CloudException(msg, code)
            }
            json
        } catch (e: CloudException) {
            throw e
        } catch (e: IOException) {
            throw CloudException("No hay conexión con el servidor. Revise internet o la dirección.", 0)
        }
    }

    suspend fun ping(base: String) {
        val j = request("ping", base = base, token = "")
        if (j.optString("app") != "inventario-pro") throw CloudException("La dirección no corresponde a un servidor de Inventario Pro", 404)
    }

    /** Devuelve token, usuario y si la cuenta ya tiene datos en el servidor. */
    suspend fun login(base: String, username: String, password: String, device: String): Triple<String, CloudUser, Boolean> {
        ping(base)
        val j = request(
            "login",
            JSONObject().put("username", username.trim()).put("password", password).put("device", device),
            base = base,
            token = "",
        )
        return Triple(j.getString("token"), CloudUser.from(j.getJSONObject("user")), j.optBoolean("hasData"))
    }

    suspend fun logout() {
        runCatching { request("logout", JSONObject()) }
    }

    suspend fun sync(since: Long): SyncResult {
        val j = request("sync&since=$since")
        val deleted = j.optJSONObject("deleted") ?: JSONObject()
        fun ids(key: String): List<Long> = deleted.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.getLong(it) } }.orEmpty()
        return SyncResult(
            rev = j.getLong("rev"),
            user = CloudUser.from(j.getJSONObject("user")),
            items = j.getJSONArray("items").objects().map { it.toItem() },
            clients = j.getJSONArray("clients").objects().map { it.toClient() },
            sales = j.getJSONArray("sales").objects().map { it.toSale() },
            deletedItems = ids("items"),
            deletedClients = ids("clients"),
            deletedSaleIds = ids("sales"),
            brand = j.optJSONObject("settings"),
        )
    }

    suspend fun commit(changes: ChangeSet): CommitResult {
        val j = request("commit", changes.toJson())
        return CommitResult(
            items = j.getJSONArray("items").objects().map { it.toItem() },
            clients = j.getJSONArray("clients").objects().map { it.toClient() },
            sales = j.getJSONArray("sales").objects().map { it.toSale() },
        )
    }

    suspend fun import(
        items: List<Item>,
        clients: List<Client>,
        sales: List<Sale>,
        brand: JSONObject,
        base: String = settings.current.serverUrl,
        token: String = settings.current.authToken,
    ) {
        request(
            "import",
            JSONObject()
                .put("items", JSONArray(items.map { it.toJson() }))
                .put("clients", JSONArray(clients.map { it.toJson() }))
                .put("sales", JSONArray(sales.map { it.toJson() }))
                .put("settings", brand),
            base = base,
            token = token,
        )
    }

    suspend fun saveBrand(brand: JSONObject) {
        request("settings", brand)
    }

    suspend fun changePassword(current: String, new: String) {
        request("password", JSONObject().put("current", current).put("new", new))
    }

    suspend fun users(): List<CloudUser> = request("users").getJSONArray("users").objects().map { CloudUser.from(it) }

    suspend fun saveUser(
        id: Long,
        name: String,
        username: String,
        password: String,
        phone: String,
        role: String,
        active: Boolean,
        expiresAt: Long,
    ): CloudUser {
        val body = JSONObject()
            .put("id", id).put("name", name.trim()).put("username", username.trim().lowercase())
            .put("password", password).put("phone", phone.trim()).put("role", role)
            .put("active", active).put("expiresAt", expiresAt)
        return CloudUser.from(request("users_save", body).getJSONObject("user"))
    }

    /** Última versión publicada de la app (no requiere sesión). */
    suspend fun latestRelease(base: String = settings.current.serverUrl): AppRelease? {
        val j = request("version", base = base, token = "").optJSONObject("release") ?: return null
        if (j.optInt("versionCode") <= 0 || j.optString("url").isBlank()) return null
        return AppRelease(j.optInt("versionCode"), j.optString("versionName"), j.optString("notes"), j.optString("url"))
    }

    suspend fun activity(): List<ActivityEntry> = request("activity&limit=200").getJSONArray("activity").objects().map {
        ActivityEntry(it.optString("userName"), it.optString("action"), it.optLong("createdAt"))
    }
}
