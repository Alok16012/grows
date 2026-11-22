package com.growus.dialer

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * The ERP's own Call Dialer screens (/dialer) in a WebView, plus two bridges the page uses:
 *  - GrowusDialerPairing: the page pairs this phone to the signed-in login and hands over a device token,
 *  - GrowusDialer: "Call" in the page dials at once from this phone.
 * Only the ERP's own pages are loaded; any other link opens in the browser.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    @Volatile private var currentUrl: String = ""
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val erpHost = Uri.parse(Api.base).host

    private fun isErp(url: String?) = url != null && Uri.parse(url).host == erpHost

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        setContentView(web)
        CookieManager.getInstance().setAcceptCookie(true)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            userAgentString = "$userAgentString GrowusDialer/${BuildConfig.VERSION_NAME}"
        }
        web.addJavascriptInterface(PairingBridge(), "GrowusDialerPairing")
        web.addJavascriptInterface(DialBridge(), "GrowusDialer")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.scheme == "tel") { callFromPage(u.schemeSpecificPart, null); return true }
                if (isErp(u.toString())) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                return true
            }
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) { currentUrl = url }
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) { currentUrl = url }
            override fun onPageFinished(view: WebView, url: String) {
                currentUrl = url
                CookieManager.getInstance().flush()
                // Just signed in (the ERP sent us to its home page): go to the dialer, which pairs this phone.
                val path = Uri.parse(url).path ?: "/"
                val busy = listOf("/login", "/dialer", "/setup-mpin", "/profile").any { path.startsWith(it) }
                if (isErp(url) && Prefs.token(this@MainActivity) == null && !busy) view.loadUrl("${Api.base}/dialer?tab=my&pair=1")
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // <input type="file"> — the CSV import on Sales leads.
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                return try { startActivityForResult(params.createIntent(), 42); true } catch (_: Exception) { fileCallback = null; false }
            }
        }
        askPermissions()
        load(intent)
        if (Prefs.token(this) != null) DialerService.start(this)
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); load(intent) }

    private fun load(i: Intent?) {
        val path = i?.getStringExtra("path")
        web.loadUrl(Api.base + (path ?: if (Prefs.token(this) != null) "/dialer?tab=my" else "/login?callbackUrl=%2Fdialer%3Ftab%3Dmy%26pair%3D1"))
    }

    @Deprecated("Activity API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == 42) { fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null; return }
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
    }

    @Deprecated("Activity API")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed() }

    override fun onResume() {
        super.onResume()
        // Back from a call: sync straight away so the page can ask what happened.
        DialerService.poke(this)
    }

    // ─── Permissions ────────────────────────────────────────────────────────
    private fun askPermissions() {
        val want = mutableListOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_CALL_LOG, Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) want += Manifest.permission.POST_NOTIFICATIONS
        val missing = want.filter { !has(it) }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 7)
        else askBattery()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        // Restart the service so it picks up call-state permission.
        if (Prefs.token(this) != null) { DialerService.stop(this); DialerService.start(this) }
        askBattery()
    }

    /** Without this, Android may pause the sync while the screen is off. Asked once. */
    @SuppressLint("BatteryLife")
    private fun askBattery() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName) || Prefs.askedBattery(this)) return
        Prefs.setAskedBattery(this)
        runCatching { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
    }

    // ─── Bridges (only answer the ERP's own pages) ─────────────────────────
    private fun callFromPage(phone: String, requestId: String?) {
        if (requestId != null) Prefs.handled.add(requestId)
        val ok = Dialer.place(this, phone)
        if (!ok && !has(Manifest.permission.CALL_PHONE)) askPermissions()
        if (requestId != null && Prefs.token(this) != null) Thread {
            runCatching { Api.post(this, "/api/dialer/device/request/$requestId", JSONObject().put("status", if (ok) "DIALING" else "FAILED")) }
        }.start()
    }

    inner class PairingBridge {
        @JavascriptInterface fun hasToken(): Boolean = isErp(currentUrl) && Prefs.token(this@MainActivity) != null
        @JavascriptInterface fun setToken(token: String, name: String) {
            if (!isErp(currentUrl) || !token.startsWith("gd_")) return
            Prefs.setToken(this@MainActivity, token, name)
            Prefs.setLastId(this@MainActivity, 0)
            runOnUiThread { DialerService.start(this@MainActivity) }
        }
        @JavascriptInterface fun deviceName(): String = Dialer.deviceName
        @JavascriptInterface fun appVersion(): String = BuildConfig.VERSION_NAME
    }

    inner class DialBridge {
        @JavascriptInterface fun isApp(): Boolean = true
        @JavascriptInterface fun dial(phone: String, requestId: String) {
            if (!isErp(currentUrl)) return
            runOnUiThread { callFromPage(phone, requestId.ifBlank { null }) }
        }
    }
}
