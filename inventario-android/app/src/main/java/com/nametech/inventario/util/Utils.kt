package com.nametech.inventario.util

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.nametech.inventario.data.AppSettings
import com.nametech.inventario.data.Client
import com.nametech.inventario.data.Item
import com.nametech.inventario.data.ItemStatus
import com.nametech.inventario.domain.daysLeft
import com.nametech.inventario.domain.daysText
import com.nametech.inventario.domain.effectiveExpiration
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object Fmt {
    private val dateFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy")
    private val dateTimeFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

    fun date(epochDay: Long?): String = epochDay?.let { LocalDate.ofEpochDay(it).format(dateFmt) } ?: "—"

    fun dateTime(millis: Long?): String = millis?.let {
        Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(dateTimeFmt)
    } ?: "—"

    fun money(value: Double, s: AppSettings): String {
        val nf = NumberFormat.getNumberInstance(Locale("es", "CO")).apply {
            minimumFractionDigits = s.currencyDecimals
            maximumFractionDigits = s.currencyDecimals
        }
        return "${s.currencySymbol}${nf.format(value)}"
    }

    /** Para mostrar un número en un campo editable (sin separadores de miles). */
    fun plain(value: Double): String =
        if (value == 0.0) "" else if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

    fun parseMoney(text: String): Double =
        text.replace(" ", "").replace(",", ".").filter { it.isDigit() || it == '.' }.toDoubleOrNull() ?: 0.0
}

object Messages {
    /** Valores de las variables que, si están vacías, hacen que se omita su línea. */
    private val optionalKeys = setOf("usuario", "clave", "perfil", "link", "vence", "dias", "precio")

    fun fill(template: String, item: Item, client: Client?, s: AppSettings, today: Long): String {
        val exp = item.effectiveExpiration()
        val price = if (item.status == ItemStatus.SOLD && item.salePrice > 0) item.salePrice else item.suggestedPrice
        val values = mapOf(
            "cliente" to client?.name.orEmpty().trim(),
            "servicio" to item.name,
            "plan" to item.plan,
            "usuario" to item.accessUser,
            "clave" to item.accessPassword,
            "perfil" to item.profilePin,
            "link" to item.accessUrl,
            "vence" to if (exp == null) "" else Fmt.date(exp),
            "dias" to if (exp == null) "" else daysText(item.daysLeft(today)).lowercase(),
            "precio" to if (price > 0) Fmt.money(price, s) else "",
            "negocio" to s.businessName,
        )
        return template.lines()
            .filterNot { line -> optionalKeys.any { key -> line.contains("{$key}") && values[key].isNullOrBlank() } }
            .joinToString("\n") { line ->
                var out = line
                values.forEach { (k, v) -> out = out.replace("{$k}", v) }
                out.replace("  ", " ").replace(" :", ":").trimEnd()
            }
            .trim()
    }

    fun credentialsPlain(item: Item): String = buildString {
        appendLine(item.name + if (item.plan.isNotBlank()) " - ${item.plan}" else "")
        if (item.accessUser.isNotBlank()) appendLine("Usuario: ${item.accessUser}")
        if (item.accessPassword.isNotBlank()) appendLine("Clave: ${item.accessPassword}")
        if (item.profilePin.isNotBlank()) appendLine("Perfil/PIN: ${item.profilePin}")
        if (item.accessUrl.isNotBlank()) appendLine("Acceso: ${item.accessUrl}")
        if (item.extraInfo.isNotBlank()) appendLine(item.extraInfo)
    }.trim()
}

object WhatsApp {
    /** Deja el número solo con dígitos e incluye el indicativo del país si falta. */
    fun normalize(phone: String, countryCode: String): String {
        val trimmed = phone.trim()
        val digits = trimmed.filter { it.isDigit() }
        if (digits.isEmpty()) return ""
        return when {
            trimmed.startsWith("+") -> digits
            digits.startsWith("00") -> digits.drop(2)
            digits.length <= 10 && countryCode.isNotBlank() -> countryCode.filter { it.isDigit() } + digits
            else -> digits
        }
    }

    /** Abre un chat de WhatsApp con el mensaje escrito. Sin número, WhatsApp pide elegir el contacto. */
    fun open(context: Context, phone: String, text: String, s: AppSettings): Boolean {
        val number = normalize(phone, s.countryCode)
        val uri = Uri.parse(
            buildString {
                append("https://api.whatsapp.com/send?")
                if (number.isNotEmpty()) append("phone=").append(number).append("&")
                append("text=").append(Uri.encode(text))
            },
        )
        val preferred = if (s.useWhatsAppBusiness) "com.whatsapp.w4b" else "com.whatsapp"
        val candidates = listOf(preferred, if (s.useWhatsAppBusiness) "com.whatsapp" else "com.whatsapp.w4b", null)
        for (pkg in candidates) {
            try {
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    if (pkg != null) setPackage(pkg)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                return true
            } catch (_: ActivityNotFoundException) {
                // Probar con la siguiente opción.
            }
        }
        Toast.makeText(context, "No se encontró WhatsApp en el dispositivo", Toast.LENGTH_LONG).show()
        return false
    }
}

fun Context.copyToClipboard(label: String, text: String) {
    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText(label, text))
    Toast.makeText(this, "$label copiado", Toast.LENGTH_SHORT).show()
}

fun Context.shareText(text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    startActivity(Intent.createChooser(send, "Compartir").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

fun Context.dial(phone: String) {
    try {
        startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}")))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(this, "No hay app de teléfono", Toast.LENGTH_SHORT).show()
    }
}

fun Context.openUrl(url: String) {
    val fixed = if (url.startsWith("http://") || url.startsWith("https://")) url else "https://$url"
    try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fixed)))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(this, "No se pudo abrir el enlace", Toast.LENGTH_SHORT).show()
    }
}
