package com.techzeno.crmtracker

import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Bundle
import android.telephony.TelephonyManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.core.content.ContextCompat
import com.techzeno.crmtracker.call.CallMonitorService
import com.techzeno.crmtracker.call.CallStateReceiver
import com.techzeno.crmtracker.ui.MainScreen
import com.techzeno.crmtracker.ui.MainViewModel
import com.techzeno.crmtracker.ui.PermissionHelper
import com.techzeno.crmtracker.ui.theme.CrmCallTrackerTheme
import timber.log.Timber

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()
    private val callReceiver = CallStateReceiver()
    private lateinit var permissionHelper: PermissionHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Timber.d("MainActivity.onCreate start")

        permissionHelper = PermissionHelper(this)
        permissionHelper.setPermissionListener { granted ->
            vm.updatePermissionStatus(granted)
            Timber.tag("CRM_CALL_TRACKER").d("permission listener fired; granted=%s", granted)
        }

        val requiredPermissions = arrayOf(
            android.Manifest.permission.READ_PHONE_STATE,
            android.Manifest.permission.READ_CALL_LOG,
            android.Manifest.permission.READ_PHONE_NUMBERS,
            android.Manifest.permission.READ_CONTACTS
        )

        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        Timber.tag("CRM_CALL_TRACKER").d("Missing runtime permissions: %s", missingPermissions)
        if (missingPermissions.isNotEmpty()) {
            vm.updatePermissionStatus(false)
            permissionHelper.requestPhonePermissions()
        } else {
            vm.updatePermissionStatus(true)
        }

        val filter = IntentFilter().apply {
            addAction(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
            addAction(Intent.ACTION_NEW_OUTGOING_CALL)
        }
        registerReceiver(callReceiver, filter)
        Timber.tag("CRM_CALL_TRACKER").d("MainActivity registered dynamic CallStateReceiver for phone-state and outgoing-call broadcasts")

        startService(Intent(this, CallMonitorService::class.java))
        Timber.tag("CRM_CALL_TRACKER").d("MainActivity started CallMonitorService")

        setContent {
            CrmCallTrackerTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    MainScreen(vm = vm)
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(callReceiver)
            Timber.d("Unregistered CallStateReceiver in onDestroy")
        } catch (ex: Exception) {
            Timber.d("Error unregistering receiver: %s", ex.message)
        }
    }
}
