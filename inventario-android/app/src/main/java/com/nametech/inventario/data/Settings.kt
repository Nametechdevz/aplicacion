package com.nametech.inventario.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.MessageDigest

data class AppSettings(
    val businessName: String = "Mi Negocio",
    val currencySymbol: String = "$",
    val currencyDecimals: Int = 0,
    val countryCode: String = "57",
    val dueSoonDays: Int = 3,
    val notificationsEnabled: Boolean = true,
    val notifyHour: Int = 9,
    val useWhatsAppBusiness: Boolean = false,
    val defaultSaleMonths: Int = 1,
    val templateCredentials: String = Templates.DEFAULT_CREDENTIALS,
    val templateReminder: String = Templates.DEFAULT_REMINDER,
    val templateExpired: String = Templates.DEFAULT_EXPIRED,
    val templatePayment: String = Templates.DEFAULT_PAYMENT,
    val pinHash: String = "",
    // ---- Tema
    /** SYSTEM, LIGHT o DARK. */
    val themeMode: String = "SYSTEM",
    // ---- Cuenta en el servidor (vacío = solo en este teléfono)
    val modeChosen: Boolean = false,
    /** true = el usuario trabaja con su cuenta del servidor. */
    val cloudMode: Boolean = false,
    val serverUrl: String = "",
    val authToken: String = "",
    val userId: Long = 0,
    val userName: String = "",
    val username: String = "",
    val userRole: String = "",
    val accessExpiresAt: Long = 0,
    val lastRev: Long = 0,
    val lastSyncAt: Long = 0,
) {
    val isCloud: Boolean get() = cloudMode && serverUrl.isNotBlank() && authToken.isNotBlank()
    val needsLogin: Boolean get() = cloudMode && authToken.isBlank()
    val isAdmin: Boolean get() = isCloud && userRole == "ADMIN"

    /** Marca y preferencias que se guardan en el servidor y se comparten entre los dispositivos del usuario. */
    fun brandJson(): org.json.JSONObject = org.json.JSONObject()
        .put("businessName", businessName).put("currencySymbol", currencySymbol)
        .put("currencyDecimals", currencyDecimals).put("countryCode", countryCode)
        .put("dueSoonDays", dueSoonDays).put("defaultSaleMonths", defaultSaleMonths)
        .put("templateCredentials", templateCredentials).put("templateReminder", templateReminder)
        .put("templateExpired", templateExpired).put("templatePayment", templatePayment)

    fun withBrand(j: org.json.JSONObject): AppSettings = copy(
        businessName = j.optString("businessName", businessName),
        currencySymbol = j.optString("currencySymbol", currencySymbol),
        currencyDecimals = j.optInt("currencyDecimals", currencyDecimals),
        countryCode = j.optString("countryCode", countryCode),
        dueSoonDays = j.optInt("dueSoonDays", dueSoonDays),
        defaultSaleMonths = j.optInt("defaultSaleMonths", defaultSaleMonths),
        templateCredentials = j.optString("templateCredentials", templateCredentials),
        templateReminder = j.optString("templateReminder", templateReminder),
        templateExpired = j.optString("templateExpired", templateExpired),
        templatePayment = j.optString("templatePayment", templatePayment),
    )
}

object Templates {
    const val DEFAULT_CREDENTIALS = "Hola {cliente} 👋\n" +
        "Aquí están los datos de tu *{servicio}* {plan}:\n\n" +
        "📧 Usuario: {usuario}\n" +
        "🔑 Clave: {clave}\n" +
        "👤 Perfil/PIN: {perfil}\n" +
        "🔗 Acceso: {link}\n" +
        "📅 Vence: {vence}\n\n" +
        "⚠️ No cambies la clave ni el perfil.\n" +
        "Gracias por tu compra en *{negocio}* 🙌"

    const val DEFAULT_REMINDER = "Hola {cliente} 👋\n" +
        "Te recordamos que tu servicio de *{servicio}* vence el *{vence}* ({dias}).\n" +
        "¿Deseas renovarlo? 💳 Valor: {precio}\n\n" +
        "*{negocio}*"

    const val DEFAULT_EXPIRED = "Hola {cliente} 👋\n" +
        "Tu servicio de *{servicio}* venció el *{vence}*.\n" +
        "Si deseas seguir disfrutándolo, escríbenos para renovarlo 🙌 Valor: {precio}\n\n" +
        "*{negocio}*"

    const val DEFAULT_PAYMENT = "Hola {cliente} 👋\n" +
        "Te recordamos el pago pendiente de *{servicio}* por {precio}.\n" +
        "¡Muchas gracias! 🙏\n\n" +
        "*{negocio}*"

    const val HELP = "Variables: {cliente} {servicio} {plan} {usuario} {clave} {perfil} " +
        "{link} {vence} {dias} {precio} {negocio}. Las líneas con datos vacíos se omiten."
}

class SettingsRepository(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val state = MutableStateFlow(load())
    val flow: StateFlow<AppSettings> = state.asStateFlow()
    val current: AppSettings get() = state.value

    private fun load(): AppSettings {
        val d = AppSettings()
        return AppSettings(
            businessName = prefs.getString("businessName", d.businessName)!!,
            currencySymbol = prefs.getString("currencySymbol", d.currencySymbol)!!,
            currencyDecimals = prefs.getInt("currencyDecimals", d.currencyDecimals),
            countryCode = prefs.getString("countryCode", d.countryCode)!!,
            dueSoonDays = prefs.getInt("dueSoonDays", d.dueSoonDays),
            notificationsEnabled = prefs.getBoolean("notificationsEnabled", d.notificationsEnabled),
            notifyHour = prefs.getInt("notifyHour", d.notifyHour),
            useWhatsAppBusiness = prefs.getBoolean("useWhatsAppBusiness", d.useWhatsAppBusiness),
            defaultSaleMonths = prefs.getInt("defaultSaleMonths", d.defaultSaleMonths),
            templateCredentials = prefs.getString("templateCredentials", d.templateCredentials)!!,
            templateReminder = prefs.getString("templateReminder", d.templateReminder)!!,
            templateExpired = prefs.getString("templateExpired", d.templateExpired)!!,
            templatePayment = prefs.getString("templatePayment", d.templatePayment)!!,
            pinHash = prefs.getString("pinHash", d.pinHash)!!,
            themeMode = prefs.getString("themeMode", d.themeMode)!!,
            modeChosen = prefs.getBoolean("modeChosen", d.modeChosen),
            cloudMode = prefs.getBoolean("cloudMode", d.cloudMode),
            serverUrl = prefs.getString("serverUrl", d.serverUrl)!!,
            authToken = prefs.getString("authToken", d.authToken)!!,
            userId = prefs.getLong("userId", d.userId),
            userName = prefs.getString("userName", d.userName)!!,
            username = prefs.getString("username", d.username)!!,
            userRole = prefs.getString("userRole", d.userRole)!!,
            accessExpiresAt = prefs.getLong("accessExpiresAt", d.accessExpiresAt),
            lastRev = prefs.getLong("lastRev", d.lastRev),
            lastSyncAt = prefs.getLong("lastSyncAt", d.lastSyncAt),
        )
    }

    @Synchronized
    fun update(transform: (AppSettings) -> AppSettings) {
        val s = transform(state.value)
        prefs.edit()
            .putString("businessName", s.businessName)
            .putString("currencySymbol", s.currencySymbol)
            .putInt("currencyDecimals", s.currencyDecimals)
            .putString("countryCode", s.countryCode)
            .putInt("dueSoonDays", s.dueSoonDays)
            .putBoolean("notificationsEnabled", s.notificationsEnabled)
            .putInt("notifyHour", s.notifyHour)
            .putBoolean("useWhatsAppBusiness", s.useWhatsAppBusiness)
            .putInt("defaultSaleMonths", s.defaultSaleMonths)
            .putString("templateCredentials", s.templateCredentials)
            .putString("templateReminder", s.templateReminder)
            .putString("templateExpired", s.templateExpired)
            .putString("templatePayment", s.templatePayment)
            .putString("pinHash", s.pinHash)
            .putString("themeMode", s.themeMode)
            .putBoolean("modeChosen", s.modeChosen)
            .putBoolean("cloudMode", s.cloudMode)
            .putString("serverUrl", s.serverUrl)
            .putString("authToken", s.authToken)
            .putLong("userId", s.userId)
            .putString("userName", s.userName)
            .putString("username", s.username)
            .putString("userRole", s.userRole)
            .putLong("accessExpiresAt", s.accessExpiresAt)
            .putLong("lastRev", s.lastRev)
            .putLong("lastSyncAt", s.lastSyncAt)
            .apply()
        state.value = s
    }

    companion object {
        fun hashPin(pin: String): String =
            MessageDigest.getInstance("SHA-256")
                .digest("inventario:$pin".toByteArray())
                .joinToString("") { "%02x".format(it) }
    }
}
