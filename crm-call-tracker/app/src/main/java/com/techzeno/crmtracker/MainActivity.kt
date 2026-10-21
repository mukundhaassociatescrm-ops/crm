package com.techzeno.crmtracker

import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.core.content.ContextCompat
import com.techzeno.crmtracker.ui.MainScreen
import com.techzeno.crmtracker.ui.MainViewModel
import com.techzeno.crmtracker.ui.PermissionHelper
import com.techzeno.crmtracker.ui.theme.CrmCallTrackerTheme
import timber.log.Timber

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()
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

        setContent {
            CrmCallTrackerTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    MainScreen(vm = vm)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        vm.updatePermissionStatus(permissionHelper.isPermissionGranted())
        vm.refreshCallData()
    }
}
