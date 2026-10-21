package com.techzeno.crmtracker

import android.app.Application
import timber.log.Timber
import com.techzeno.crmtracker.call.CallLogSynchronizer
import com.techzeno.crmtracker.data.CallRepository

class CrmApp : Application() {
    lateinit var callLogSynchronizer: CallLogSynchronizer
        private set

    override fun onCreate() {
        super.onCreate()
        Timber.plant(Timber.DebugTree())
        // Initialize repository and database
        CallRepository.init(this)
        callLogSynchronizer = CallLogSynchronizer(this, CallRepository.getInstance())
        callLogSynchronizer.requestSync()
    }
}
