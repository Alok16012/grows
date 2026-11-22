package com.growus.dialer

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.telecom.TelecomManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Collections

/** Small private store: the device token from pairing and the call-log cursor. */
object Prefs {
    private fun p(c: Context) = c.getSharedPreferences("dialer", Context.MODE_PRIVATE)
    fun token(c: Context): String? = p(c).getString("token", null)
    fun userName(c: Context): String = p(c).getString("user", "") ?: ""
    fun setToken(c: Context, token: String?, user: String = "") {
        p(c).edit().putString("token", token).putString("user", user).apply()
        if (token == null) p(c).edit().remove("lastId").apply()
    }
    /** Highest CallLog._ID already sent. New calls always get a higher id, even when a long call started earlier. */
    fun lastId(c: Context): Long = p(c).getLong("lastId", 0L)
    fun setLastId(c: Context, id: Long) = p(c).edit().putLong("lastId", id).apply()
    fun askedBattery(c: Context) = p(c).getBoolean("askedBattery", false)
    fun setAskedBattery(c: Context) = p(c).edit().putBoolean("askedBattery", true).apply()

    /** Click-to-call requests already dialled (from the app screen or the service), so none is dialled twice. */
    val handled: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())
}

fun Context.has(perm: String) = checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED

class ApiError(val code: Int, msg: String) : Exception(msg)

/** JSON over HTTPS to the ERP with the device token. Call off the main thread. */
object Api {
    val base: String = BuildConfig.ERP_URL.trimEnd('/')
    fun post(c: Context, path: String, body: JSONObject): JSONObject {
        val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 30000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
            Prefs.token(c)?.let { setRequestProperty("X-Dialer-Token", it) }
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            if (code !in 200..299) throw ApiError(code, runCatching { JSONObject(text).optString("error") }.getOrNull()?.ifBlank { null } ?: "HTTP $code")
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        } finally { conn.disconnect() }
    }
}

/** New entries in the phone's call log since the last sync. */
object CallLogReader {
    data class Batch(val calls: JSONArray, val maxId: Long)

    @SuppressLint("MissingPermission")
    fun since(c: Context, lastId: Long, limit: Int = 200): Batch {
        val out = JSONArray()
        var maxId = lastId
        if (!c.has(Manifest.permission.READ_CALL_LOG)) return Batch(out, maxId)
        // First sync after pairing: only the last 3 days.
        val sel = if (lastId > 0) "${CallLog.Calls._ID} > ?" else "${CallLog.Calls.DATE} > ?"
        val arg = if (lastId > 0) lastId.toString() else (System.currentTimeMillis() - 3L * 86400_000L).toString()
        c.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE, CallLog.Calls.DURATION),
            sel, arrayOf(arg), "${CallLog.Calls._ID} ASC"
        )?.use { cur ->
            while (cur.moveToNext() && out.length() < limit) {
                val id = cur.getLong(0)
                maxId = maxOf(maxId, id)
                val dir = when (cur.getInt(2)) {
                    CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                    CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                    CallLog.Calls.MISSED_TYPE -> "MISSED"
                    CallLog.Calls.REJECTED_TYPE -> "REJECTED"
                    else -> null // voicemail, blocked, answered elsewhere
                } ?: continue
                val number = cur.getString(1) ?: continue
                if (number.isBlank()) continue
                out.put(JSONObject().put("number", number).put("direction", dir).put("startedAt", cur.getLong(3)).put("durationSec", cur.getLong(4)))
            }
        }
        return Batch(out, maxId)
    }
}

object Dialer {
    /** Places a call through the phone's own dialer (needs CALL_PHONE). Returns false if it could not. */
    @SuppressLint("MissingPermission")
    fun place(c: Context, phone: String): Boolean {
        val number = phone.filter { it.isDigit() || it == '+' }
        if (number.length < 6 || !c.has(Manifest.permission.CALL_PHONE)) return false
        return try {
            val tm = c.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            tm.placeCall(Uri.fromParts("tel", number, null), null)
            true
        } catch (e: Exception) {
            // Some phones refuse placeCall from the background; fall back to the call screen.
            try {
                c.startActivity(android.content.Intent(android.content.Intent.ACTION_CALL, Uri.fromParts("tel", number, null)).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
                true
            } catch (_: Exception) { false }
        }
    }

    val deviceName: String get() = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".trim()
}
