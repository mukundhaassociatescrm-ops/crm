package com.techzeno.crmtracker.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.data.CallRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import timber.log.Timber

class MainViewModel(private val repo: CallRepository = CallRepository.getInstance()) : ViewModel() {
    private val _serviceStatus = MutableStateFlow("Running")
    val serviceStatus: StateFlow<String> = _serviceStatus

    private val _permissionStatus = MutableStateFlow("Unknown")
    val permissionStatus: StateFlow<String> = _permissionStatus

    private val _lastCall = MutableStateFlow<CallEvent?>(null)
    val lastCall: StateFlow<CallEvent?> = _lastCall

    private val _recentCalls = MutableStateFlow<List<CallEvent>>(emptyList())
    val recentCalls: StateFlow<List<CallEvent>> = _recentCalls

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading

    init {
        _serviceStatus.value = "Running"
        _permissionStatus.value = "Check in Settings"
        _isLoading.value = true

        viewModelScope.launch {
            repo.getLatestCallFlow().collectLatest { latest ->
                _lastCall.value = latest
                Timber.tag("CRM_CALL_TRACKER").d("MainViewModel observed latest call: %s", latest)
            }
        }

        viewModelScope.launch {
            repo.getAllCallsFlow().collectLatest { calls ->
                _recentCalls.value = calls
                _isLoading.value = false
                Timber.tag("CRM_CALL_TRACKER").d("MainViewModel observed recent calls count=%s", calls.size)
            }
        }
    }

    fun updatePermissionStatus(granted: Boolean) {
        _permissionStatus.value = if (granted) "Granted" else "Check in Settings"
        Timber.tag("CRM_CALL_TRACKER").d("MainViewModel permission status updated: %s", _permissionStatus.value)
    }

    fun refreshStatus() {
        Timber.tag("CRM_CALL_TRACKER").d("Refreshing status")
        _serviceStatus.value = "Running"
        _permissionStatus.value = if (_permissionStatus.value == "Granted") "Granted" else "Check in Settings"
    }
}
