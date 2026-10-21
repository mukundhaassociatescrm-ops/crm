package com.techzeno.crmtracker.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.techzeno.crmtracker.CrmApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CallStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED ||
            intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_IDLE
        ) return

        val pendingResult = goAsync()
        val synchronizer = (context.applicationContext as CrmApp).callLogSynchronizer
        CoroutineScope(Dispatchers.IO).launch {
            try {
                synchronizer.syncAfterCall()
            } finally {
                pendingResult.finish()
            }
        }
    }
}
