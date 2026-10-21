package com.techzeno.crmtracker.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.CallLog
import com.techzeno.crmtracker.data.CallRepository
import com.techzeno.crmtracker.data.readDeviceCallLog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import timber.log.Timber

class CallLogSynchronizer(
    private val context: Context,
    private val repository: CallRepository
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    private var refreshJob: Job? = null
    private var observing = false
    private val _status = MutableStateFlow("Waiting for call history permission")
    val status: StateFlow<String> = _status
    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            requestSync()
        }
    }

    fun requestSync() {
        refreshJob?.cancel()
        refreshJob = scope.launch {
            delay(300)
            sync()
        }
    }

    suspend fun syncAfterCall() {
        try {
            withTimeout(8_000L) {
                // Phone-state IDLE can arrive before the dialer writes the completed call.
                for (waitMillis in listOf(0L, 1_000L, 2_000L, 3_000L)) {
                    delay(waitMillis)
                    sync()
                }
            }
        } catch (ex: TimeoutCancellationException) {
            Timber.w(ex, "Background call sync timed out; retry on next refresh")
            _status.value = "Call sync pending; refresh to retry"
        }
    }

    private suspend fun sync() = mutex.withLock {
        if (context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            _status.value = "Call history permission required"
            return@withLock
        }
        try {
            if (!observing) {
                context.contentResolver.registerContentObserver(CallLog.Calls.CONTENT_URI, true, observer)
                observing = true
            }
            _status.value = "Syncing call history"
            repository.importDeviceCalls(readDeviceCallLog(context.contentResolver))
            _status.value = "Call history up to date"
        } catch (ex: CancellationException) {
            throw ex
        } catch (ex: Exception) {
            Timber.e(ex, "Unable to sync Android call history")
            _status.value = "Call sync failed: ${ex.message ?: "Please retry"}"
        }
    }
}
