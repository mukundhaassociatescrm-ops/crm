package com.techzeno.crmtracker.ui

import android.Manifest
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import timber.log.Timber

class PermissionHelper(private val activity: ComponentActivity) {
    private val requiredPermissions = arrayOf(
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_PHONE_NUMBERS,
        Manifest.permission.READ_CONTACTS
    )

    var hasPhonePermissions by mutableStateOf(false)
        private set

    private var permissionListener: ((Boolean) -> Unit)? = null

    fun setPermissionListener(listener: (Boolean) -> Unit) {
        permissionListener = listener
    }

    private val request = activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { perms ->
        val granted = requiredPermissions.all { perms[it] == true }
        hasPhonePermissions = granted
        Timber.tag("CRM_CALL_TRACKER").d("permission result=%s granted=%s", perms, granted)
        permissionListener?.invoke(granted)
    }

    fun requestPhonePermissions() {
        Timber.tag("CRM_CALL_TRACKER").d("requesting runtime permissions=%s", requiredPermissions.toList())
        request.launch(requiredPermissions)
    }

    fun isPermissionGranted(): Boolean = requiredPermissions.all {
        android.content.pm.PackageManager.PERMISSION_GRANTED == activity.checkSelfPermission(it)
    }
}
