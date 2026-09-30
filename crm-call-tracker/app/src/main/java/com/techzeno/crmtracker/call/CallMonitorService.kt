package com.techzeno.crmtracker.call

import android.app.Service
import android.content.Intent
import android.os.IBinder
import timber.log.Timber

/**
 * A lightweight Service stub for hosting call monitoring registration.
 * The actual monitoring is implemented in CallStateReceiver to keep logic testable.
 */
class CallMonitorService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Timber.d("CallMonitorService created")
    }

    override fun onDestroy() {
        super.onDestroy()
        Timber.d("CallMonitorService destroyed")
    }
}
