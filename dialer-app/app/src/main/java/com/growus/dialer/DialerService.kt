package com.growus.dialer

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import org.json.JSONObject

/**
 * Runs while the phone is paired (notification "Dialer on"):
 *  - checks in with the ERP every few seconds in working hours (the server says how often),
 *  - dials a call when someone clicks Call in the ERP,
 *  - reports "on a call" for the live view, and
 *  - sends new call-log entries (number, time, direction, duration) right after each call.
 */
class DialerService : Service() {
    companion object {
        private const val CH_RUN = "dialer_running"
        private const val CH_CALL = "dialer_outcome"
        private const val ID_RUN = 1
        fun start(c: Context) {
            val i = Intent(c, DialerService::class.java)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }
        fun stop(c: Context) = c.stopService(Intent(c, DialerService::class.java))
        /** Ask the running service to sync now (e.g. the app screen just dialled). */
        fun poke(c: Context) { if (Prefs.token(c) != null) start(c) }
    }

    private lateinit var worker: Handler
    private lateinit var thread: HandlerThread
    @Volatile private var onCall = false
    private var nextDelay = 4000L
    private var failures = 0
    private var stateCallback: Any? = null
    private val tick = Runnable { syncOnce() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        channels()
        goForeground()
        thread = HandlerThread("dialer-sync").also { it.start() }
        worker = Handler(thread.looper)
        listenCallState()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Every startForegroundService() must be answered with startForeground().
        goForeground()
        if (Prefs.token(this) == null) { stopSelf(); return START_NOT_STICKY }
        schedule(0)
        return START_STICKY
    }

    override fun onDestroy() {
        worker.removeCallbacksAndMessages(null)
        thread.quitSafely()
        unlistenCallState()
        super.onDestroy()
    }

    private fun goForeground() {
        val n = runningNotification(lastText.ifEmpty { "Starting…" })
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID_RUN, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(ID_RUN, n)
    }

    private fun schedule(ms: Long) { worker.removeCallbacks(tick); worker.postDelayed(tick, ms) }

    private fun syncOnce() {
        if (Prefs.token(this) == null) { stopSelf(); return }
        try {
            val batch = CallLogReader.since(this, Prefs.lastId(this))
            val body = JSONObject().put("onCall", onCall).put("appVersion", BuildConfig.VERSION_NAME).put("calls", batch.calls)
            val r = Api.post(this, "/api/dialer/device/sync", body)
            if (batch.maxId > Prefs.lastId(this)) Prefs.setLastId(this, batch.maxId)
            failures = 0
            nextDelay = r.optLong("pollMs", 4000L).coerceIn(2000L, 300_000L)
            updateRunning("Dialer on · ${Prefs.userName(this)}".trimEnd(' ', '·'))
            // Outcomes to note for calls that just synced.
            r.optJSONObject("sync")?.optJSONArray("needOutcome")?.let { arr ->
                for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { askOutcome(it.optString("id"), it.optString("name")) }
            }
            // A Call clicked in the ERP.
            val p = r.optJSONObject("pending")
            if (p != null && !onCall) {
                val id = p.optString("id")
                if (id.isNotEmpty() && Prefs.handled.add(id)) {
                    val ok = Dialer.place(this, p.optString("phone"))
                    runCatching { Api.post(this, "/api/dialer/device/request/$id", JSONObject().put("status", if (ok) "DIALING" else "FAILED")) }
                    if (ok) nextDelay = 3000L
                }
            }
            // More call-log entries waiting → go again soon.
            if (batch.calls.length() >= 200) nextDelay = 500L
        } catch (e: ApiError) {
            if (e.code == 401) {
                // Unpaired in the ERP, or the login was switched off.
                Prefs.setToken(this, null)
                notifyText(3, "Growus Dialer is signed out", "Open the app and sign in again to keep syncing calls.")
                stopSelf(); return
            }
            failures++
            nextDelay = backoff()
            updateRunning("Dialer on · waiting for the ERP")
        } catch (e: Exception) {
            failures++
            nextDelay = backoff()
            updateRunning("Dialer on · no internet, will retry")
        }
        schedule(nextDelay)
    }

    private fun backoff() = minOf(60_000L, 5000L * (1L shl minOf(failures, 4)))

    // ─── Call state ─────────────────────────────────────────────────────────
    private fun onState(state: Int) {
        val was = onCall
        onCall = state == TelephonyManager.CALL_STATE_OFFHOOK
        if (onCall != was) schedule(0)
        // Call ended: the call log is written a moment later.
        if (was && state == TelephonyManager.CALL_STATE_IDLE) { worker.postDelayed({ schedule(0) }, 1500); worker.postDelayed({ schedule(0) }, 6000) }
    }

    @SuppressLint("MissingPermission")
    private fun listenCallState() {
        if (!has(Manifest.permission.READ_PHONE_STATE)) return
        val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener { override fun onCallStateChanged(state: Int) = onState(state) }
                tm.registerTelephonyCallback(mainExecutor, cb)
                stateCallback = cb
            } else {
                @Suppress("DEPRECATION")
                val l = object : PhoneStateListener(Looper.getMainLooper()) { @Deprecated("old API") override fun onCallStateChanged(state: Int, phoneNumber: String?) = onState(state) }
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                stateCallback = l
            }
        } catch (_: SecurityException) { }
    }

    private fun unlistenCallState() {
        val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        val cb = stateCallback ?: return
        if (Build.VERSION.SDK_INT >= 31 && cb is TelephonyCallback) tm.unregisterTelephonyCallback(cb)
        else if (cb is PhoneStateListener) { @Suppress("DEPRECATION") tm.listen(cb, PhoneStateListener.LISTEN_NONE) }
    }

    // ─── Notifications ──────────────────────────────────────────────────────
    private fun channels() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_RUN, "Dialer running", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        nm.createNotificationChannel(NotificationChannel(CH_CALL, "After a call", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun openApp(path: String, req: Int): PendingIntent =
        PendingIntent.getActivity(this, req, Intent(this, MainActivity::class.java).putExtra("path", path).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun runningNotification(text: String): Notification =
        Notification.Builder(this, CH_RUN).setSmallIcon(R.drawable.ic_stat_phone).setContentTitle("Growus Dialer").setContentText(text)
            .setOngoing(true).setContentIntent(openApp("/dialer?tab=my", 0)).build()

    private var lastText = ""
    private fun updateRunning(text: String) {
        if (text == lastText) return
        lastText = text
        getSystemService(NotificationManager::class.java).notify(ID_RUN, runningNotification(text))
    }

    private fun askOutcome(callId: String, name: String) {
        if (callId.isEmpty()) return
        val n = Notification.Builder(this, CH_CALL).setSmallIcon(R.drawable.ic_stat_phone)
            .setContentTitle("How did the call with $name go?").setContentText("Tap to note the outcome and the next follow-up.")
            .setAutoCancel(true).setContentIntent(openApp("/dialer?tab=my", callId.hashCode())).build()
        getSystemService(NotificationManager::class.java).notify(callId.hashCode(), n)
    }

    private fun notifyText(id: Int, title: String, text: String) {
        val n = Notification.Builder(this, CH_CALL).setSmallIcon(R.drawable.ic_stat_phone).setContentTitle(title).setContentText(text)
            .setAutoCancel(true).setContentIntent(openApp("/dialer?tab=my", id)).build()
        getSystemService(NotificationManager::class.java).notify(id, n)
    }
}
