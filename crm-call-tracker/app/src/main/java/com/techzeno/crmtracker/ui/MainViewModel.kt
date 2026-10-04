package com.techzeno.crmtracker.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import androidx.paging.filter
import androidx.paging.map
import com.techzeno.crmtracker.ContactMatchHelper
import com.techzeno.crmtracker.BuildConfig
import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.data.AdminSession
import com.techzeno.crmtracker.data.AdminSessionStore
import com.techzeno.crmtracker.data.CallTrackerTask
import com.techzeno.crmtracker.data.CreatedCrmTask
import com.techzeno.crmtracker.data.CrmApiException
import com.techzeno.crmtracker.data.CrmApiRepository
import com.techzeno.crmtracker.data.EmployeeOption
import com.techzeno.crmtracker.data.CallRepository
import com.techzeno.crmtracker.data.TodayCallActivity
import com.techzeno.crmtracker.data.localDayRange
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import timber.log.Timber

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repo: CallRepository = CallRepository.getInstance()
    private val crmApi = CrmApiRepository(BuildConfig.CRM_API_BASE_URL)
    private val sessionStore = AdminSessionStore(application)

    private val _adminSession = MutableStateFlow(sessionStore.load())
    val adminSession: StateFlow<AdminSession?> = _adminSession

    private val _isLoggingIn = MutableStateFlow(false)
    val isLoggingIn: StateFlow<Boolean> = _isLoggingIn

    private val _loginError = MutableStateFlow("")
    val loginError: StateFlow<String> = _loginError

    private val _employeeSearch = MutableStateFlow(EmployeeSearchState())
    val employeeSearch: StateFlow<EmployeeSearchState> = _employeeSearch

    private val _isCreatingTask = MutableStateFlow(false)
    val isCreatingTask: StateFlow<Boolean> = _isCreatingTask

    private val _taskError = MutableStateFlow("")
    val taskError: StateFlow<String> = _taskError

    private val _myTasksState = MutableStateFlow(MyTasksState())
    val myTasksState: StateFlow<MyTasksState> = _myTasksState

    private var employeeSearchJob: Job? = null
    private var myTasksJob: Job? = null

    private val _serviceStatus = MutableStateFlow("Running")
    val serviceStatus: StateFlow<String> = _serviceStatus

    private val _permissionStatus = MutableStateFlow("Unknown")
    val permissionStatus: StateFlow<String> = _permissionStatus

    private val _lastCall = MutableStateFlow<CallEvent?>(null)
    val lastCall: StateFlow<CallEvent?> = _lastCall

    val dashboardRecentCalls: StateFlow<List<CallEvent>> = repo.getDashboardRecentCallsFlow()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _todayRange = MutableStateFlow(localDayRange(System.currentTimeMillis()))
    private val _todayActivity = MutableStateFlow(TodayCallActivity())
    val todayActivity: StateFlow<TodayCallActivity> = _todayActivity

    private val _callsSearchQuery = MutableStateFlow("")
    val callsSearchQuery: StateFlow<String> = _callsSearchQuery

    private val _callsFilter = MutableStateFlow("All")
    val callsFilter: StateFlow<String> = _callsFilter

    private val contactNameCache = mutableMapOf<String, String>()
    private val missingContactNumbers = mutableSetOf<String>()

    @OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
    val callsPagingData: Flow<PagingData<CallListEntry>> = combine(
        _callsSearchQuery,
        _callsFilter
    ) { query, filter -> query.trim() to filter }
        .debounce(250)
        .distinctUntilChanged()
        .flatMapLatest { (query, filter) ->
            val callDirection = when (filter) {
                "Incoming" -> "INCOMING"
                "Outgoing" -> "OUTGOING"
                else -> "All"
            }
            val phoneQuery = query.takeIf { value ->
                value.any(Char::isDigit) && value.none(Char::isLetter)
            }.orEmpty()
            Pager(
                config = PagingConfig(
                    pageSize = CALLS_PAGE_SIZE,
                    initialLoadSize = CALLS_PAGE_SIZE,
                    prefetchDistance = CALLS_PREFETCH_DISTANCE,
                    enablePlaceholders = false,
                    maxSize = CALLS_MAX_CACHED_ITEMS
                ),
                pagingSourceFactory = {
                    repo.getCallsPagingSource(
                        callDirection = callDirection,
                        missedOnly = filter == "Missed",
                        phoneQuery = phoneQuery
                    )
                }
            ).flow.map { page ->
                page.map { call ->
                    CallListEntry(call, lookupContactName(call.phoneNumber))
                }.filter { entry ->
                    query.isBlank() ||
                        entry.call.phoneNumber?.contains(query, ignoreCase = true) == true ||
                        entry.contactName?.contains(query, ignoreCase = true) == true
                }
            }
        }
        .cachedIn(viewModelScope)

    init {
        _serviceStatus.value = "Running"
        _permissionStatus.value = "Check in Settings"
        viewModelScope.launch {
            repo.getLatestCallFlow().collectLatest { latest ->
                _lastCall.value = latest
                Timber.tag("CRM_CALL_TRACKER").d("MainViewModel observed latest call: %s", latest)
            }
        }

        viewModelScope.launch {
            _todayRange.collectLatest { range ->
                repo.getCallActivityBetween(range.startTime, range.endTime).collectLatest { activity ->
                    _todayActivity.value = activity
                }
            }
        }

        viewModelScope.launch {
            while (true) {
                val delayUntilTomorrow = (_todayRange.value.endTime - System.currentTimeMillis()).coerceAtLeast(1L)
                kotlinx.coroutines.delay(delayUntilTomorrow)
                _todayRange.value = localDayRange(System.currentTimeMillis())
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

    fun refreshCallData() {
        _todayRange.value = localDayRange(System.currentTimeMillis())
        viewModelScope.launch {
            _lastCall.value = repo.getLatestCall()
        }
    }

    fun refreshMyTasks() {
        val token = _adminSession.value?.token
        if (token.isNullOrBlank()) {
            _myTasksState.value = MyTasksState(error = "Sign in as an admin to load tasks.")
            return
        }

        myTasksJob?.cancel()
        _myTasksState.value = _myTasksState.value.copy(isLoading = true, error = null)
        myTasksJob = viewModelScope.launch {
            try {
                val tasks = crmApi.getCallTrackerTasks(token)
                _myTasksState.value = MyTasksState(tasks = tasks)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (error is CrmApiException && error.statusCode == 401) logout()
                _myTasksState.value = _myTasksState.value.copy(
                    isLoading = false,
                    error = error.message ?: "Unable to load Call Tracker tasks."
                )
            }
        }
    }

    fun updateCallsSearchQuery(query: String) {
        _callsSearchQuery.value = query
    }

    fun updateCallsFilter(filter: String) {
        _callsFilter.value = filter
    }

    private suspend fun lookupContactName(phoneNumber: String?): String? {
        val normalizedNumber = ContactMatchHelper.normalizePhoneNumber(phoneNumber) ?: return null
        return withContext(Dispatchers.IO) {
            synchronized(contactNameCache) {
                contactNameCache[normalizedNumber]?.let { return@synchronized it }
                if (normalizedNumber in missingContactNumbers) return@synchronized null

                val name = ContactMatchHelper.lookupContactName(getApplication(), phoneNumber)
                if (name.isNullOrBlank()) {
                    missingContactNumbers.add(normalizedNumber)
                } else {
                    contactNameCache[normalizedNumber] = name
                }
                name
            }
        }
    }

    fun login(email: String, password: String) {
        if (_isLoggingIn.value) return
        _isLoggingIn.value = true
        _loginError.value = ""
        viewModelScope.launch {
            try {
                val session = crmApi.login(email.trim(), password)
                sessionStore.save(session)
                _adminSession.value = session
            } catch (error: Exception) {
                _loginError.value = error.message ?: "Unable to sign in. Please try again."
            } finally {
                _isLoggingIn.value = false
            }
        }
    }

    fun logout() {
        employeeSearchJob?.cancel()
        sessionStore.clear()
        _adminSession.value = null
        _employeeSearch.value = EmployeeSearchState()
        _taskError.value = ""
    }

    fun searchEmployees(query: String) {
        val normalizedQuery = query.trim()
        employeeSearchJob?.cancel()
        if (normalizedQuery.length < 2) {
            _employeeSearch.value = EmployeeSearchState(query = normalizedQuery)
            return
        }
        val session = _adminSession.value ?: return
        _employeeSearch.value = EmployeeSearchState(query = normalizedQuery, isLoading = true)
        employeeSearchJob = viewModelScope.launch {
            delay(300)
            try {
                val employees = crmApi.searchEmployees(session.token, normalizedQuery)
                _employeeSearch.value = EmployeeSearchState(query = normalizedQuery, employees = employees)
            } catch (error: Exception) {
                if (error is CrmApiException && error.statusCode == 401) logout()
                _employeeSearch.value = EmployeeSearchState(
                    query = normalizedQuery,
                    error = error.message ?: "Unable to search employees."
                )
            }
        }
    }

    fun submitTask(
        title: String,
        description: String,
        assignedToId: String,
        customerName: String,
        customerPhone: String,
        dueDateMillis: Long,
        onCreated: (CreatedCrmTask) -> Unit
    ) {
        val session = _adminSession.value ?: run {
            _taskError.value = "Please sign in as an admin to create a task."
            return
        }
        if (_isCreatingTask.value) return
        _isCreatingTask.value = true
        _taskError.value = ""
        viewModelScope.launch {
            try {
                val createdTask = crmApi.createTask(
                    token = session.token,
                    title = title,
                    description = description,
                    assignedToId = assignedToId,
                    customerName = customerName,
                    customerPhone = customerPhone,
                    dueDateMillis = dueDateMillis
                )
                onCreated(createdTask)
            } catch (error: Exception) {
                if (error is CrmApiException && error.statusCode == 401) logout()
                _taskError.value = error.message ?: "Unable to create task. Please try again."
            } finally {
                _isCreatingTask.value = false
            }
        }
    }
}

private const val CALLS_PAGE_SIZE = 40
private const val CALLS_PREFETCH_DISTANCE = 10
private const val CALLS_MAX_CACHED_ITEMS = 200

data class CallListEntry(val call: CallEvent, val contactName: String?)

data class MyTasksState(
    val tasks: List<CallTrackerTask> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

data class EmployeeSearchState(
    val query: String = "",
    val employees: List<EmployeeOption> = emptyList(),
    val isLoading: Boolean = false,
    val error: String = ""
)
