package com.techzeno.crmtracker

import android.app.Application
import timber.log.Timber

class CrmApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Timber.plant(Timber.DebugTree())
        // Initialize repository and database
        com.techzeno.crmtracker.data.CallRepository.init(this)
    }
}
