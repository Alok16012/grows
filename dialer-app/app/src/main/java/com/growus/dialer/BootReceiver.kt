package com.growus.dialer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Starts syncing again after the phone restarts or the app is updated. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (Prefs.token(c) != null) DialerService.start(c)
    }
}
