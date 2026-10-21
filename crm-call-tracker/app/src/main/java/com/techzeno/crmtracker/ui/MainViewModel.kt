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
import com.techzeno.crmtracker.CrmApp
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
import com.techzeno.crmtracker.data.UploadedTaskFile
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
import java.io.File
import java.time.LocalDate

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repo: CallRepository = CallRepository.getInstance()
    val callTaskLinks = repo.getTaskLinksFlow()
        .map { links -> links.groupBy { it.callId } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())
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

    private val callLogSynchronizer = (application as CrmApp).callLogSynchronizer
    val serviceStatus: StateFlow<String> = callLogSynchronizer.status

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
        callLogSynchronizer.requestSync()
        Timber.tag("CRM_CALL_TRACKER").d("MainViewModel permission status updated: %s", _permissionStatus.value)
    }

    fun refreshStatus() {
        Timber.tag("CRM_CALL_TRACKER").d("Refreshing status")
        callLogSynchronizer.requestSync()
        _permissionStatus.value = if (_permissionStatus.value == "Granted") "Granted" else "Check in Settings"
    }

    fun refreshCallData() {
        callLogSynchronizer.requestSync()
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
        dueDate: LocalDate,
        attachments: List<TaskAttachment> = emptyList(),
        voiceNotePath: String? = null,
        voiceNoteDurationSeconds: Int = 0,
        sourceCallId: Long? = null,
        onCreated: (TaskSubmissionResult<TaskAttachment>) -> Unit
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
                val result = createTaskAndAttachFiles(
                    attachments = attachments,
                    createTask = {
                        crmApi.createTask(
                            token = session.token,
                            title = title,
                            description = description,
                            assignedToId = assignedToId,
                            customerName = customerName,
                            customerPhone = customerPhone,
                            dueDate = dueDate
                        )
                    },
                    onTaskCreated = { task ->
                        if (sourceCallId != null) {
                            try {
                                repo.linkTask(sourceCallId, task)
                            } catch (cancelled: CancellationException) {
                                throw cancelled
                            } catch (error: Exception) {
                                Timber.e(error, "Task created but call label could not be saved")
                                android.widget.Toast.makeText(
                                    getApplication<Application>(),
                                    "Task ${task.displayId.ifBlank { task.id }} created, but its call label could not be saved. Do not recreate the task.",
                                    android.widget.Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    },
                    uploadFile = { attachment ->
                        crmApi.uploadTaskAttachmentFile(
                            contentResolver = getApplication<Application>().contentResolver,
                            token = session.token,
                            uri = attachment.uri,
                            fallbackFileName = attachment.fileName,
                            fallbackMimeType = attachment.mimeType
                        )
                    },
                    attachFile = { taskId, _, uploadedFile ->
                        crmApi.attachUploadedTaskFile(session.token, taskId, uploadedFile)
                    },
                    voiceNote = voiceNotePath?.let { path ->
                        VoiceNoteDraft(File(path), voiceNoteDurationSeconds.coerceAtLeast(0))
                    },
                    uploadVoiceNote = { voiceNote ->
                        crmApi.uploadVoiceNoteFile(session.token, voiceNote.file)
                    },
                    attachVoiceNote = { taskId, voiceNote, uploadedFile ->
                        crmApi.attachTaskVoiceNote(
                            token = session.token,
                            taskId = taskId,
                            file = uploadedFile,
                            durationSeconds = voiceNote.durationSeconds
                        )
                    }
                )
                onCreated(result)
            } catch (error: Exception) {
                if (error is CrmApiException && error.statusCode == 401) logout()
                _taskError.value = error.message ?: "Unable to create task. Please try again."
            } finally {
                _isCreatingTask.value = false
            }
        }
    }

    fun retryTaskAttachments(
        taskId: String,
        failures: List<AttachmentUploadFailure<TaskAttachment>>,
        voiceNoteFailure: VoiceNoteUploadFailure? = null,
        onComplete: (TaskUploadRetryResult) -> Unit
    ) {
        val session = _adminSession.value ?: run {
            _taskError.value = "Please sign in as an admin to upload attachments."
            return
        }
        if (_isCreatingTask.value) return
        _isCreatingTask.value = true
        _taskError.value = ""
        viewModelScope.launch {
            try {
                val remainingAttachmentFailures = retryFailedTaskAttachments(
                    taskId = taskId,
                    failures = failures,
                    uploadFile = { attachment ->
                        crmApi.uploadTaskAttachmentFile(
                            contentResolver = getApplication<Application>().contentResolver,
                            token = session.token,
                            uri = attachment.uri,
                            fallbackFileName = attachment.fileName,
                            fallbackMimeType = attachment.mimeType
                        )
                    },
                    attachFile = { retryTaskId, _, uploadedFile ->
                        crmApi.attachUploadedTaskFile(session.token, retryTaskId, uploadedFile)
                    }
                )
                val remainingVoiceNoteFailure = voiceNoteFailure?.let { failure ->
                    retryFailedVoiceNote(
                        taskId = taskId,
                        failure = failure,
                        uploadVoiceNote = { voiceNote -> crmApi.uploadVoiceNoteFile(session.token, voiceNote.file) },
                        attachVoiceNote = { retryTaskId, voiceNote, uploadedFile ->
                            crmApi.attachTaskVoiceNote(
                                token = session.token,
                                taskId = retryTaskId,
                                file = uploadedFile,
                                durationSeconds = voiceNote.durationSeconds
                            )
                        }
                    )
                }
                onComplete(TaskUploadRetryResult(remainingAttachmentFailures, remainingVoiceNoteFailure))
            } catch (error: Exception) {
                if (error is CrmApiException && error.statusCode == 401) logout()
                _taskError.value = error.message ?: "Unable to retry attachments."
            } finally {
                _isCreatingTask.value = false
            }
        }
    }
}

internal suspend fun <T> createTaskAndAttachFiles(
    attachments: List<T>,
    createTask: suspend () -> CreatedCrmTask,
    uploadFile: suspend (T) -> UploadedTaskFile,
    attachFile: suspend (String, T, UploadedTaskFile) -> Unit,
    voiceNote: VoiceNoteDraft? = null,
    uploadVoiceNote: suspend (VoiceNoteDraft) -> UploadedTaskFile = { throw IllegalStateException("Voice note uploader is not configured.") },
    attachVoiceNote: suspend (String, VoiceNoteDraft, UploadedTaskFile) -> Unit = { _, _, _ -> },
    onTaskCreated: suspend (CreatedCrmTask) -> Unit = {}
): TaskSubmissionResult<T> {
    val task = createTask()
    onTaskCreated(task)
    val attachmentFailures = uploadAndAttachFiles(task.id, attachments, uploadFile, attachFile)
    val voiceNoteFailure = voiceNote?.let { note ->
        var uploadedFile: UploadedTaskFile? = null
        try {
            uploadedFile = uploadVoiceNote(note)
            attachVoiceNote(task.id, note, uploadedFile)
            null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            VoiceNoteUploadFailure(note, error.message ?: "Voice note upload failed.", uploadedFile)
        }
    }
    return TaskSubmissionResult(
        task = task,
      attachmentFailures = attachmentFailures,
      voiceNoteFailure = voiceNoteFailure
    )
}

internal suspend fun retryFailedVoiceNote(
    taskId: String,
    failure: VoiceNoteUploadFailure,
    uploadVoiceNote: suspend (VoiceNoteDraft) -> UploadedTaskFile,
    attachVoiceNote: suspend (String, VoiceNoteDraft, UploadedTaskFile) -> Unit
): VoiceNoteUploadFailure? {
    var uploadedFile = failure.uploadedFile
    return try {
        if (uploadedFile == null) uploadedFile = uploadVoiceNote(failure.voiceNote)
        attachVoiceNote(taskId, failure.voiceNote, uploadedFile)
        null
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        failure.copy(
            message = error.message ?: "Voice note upload failed.",
            uploadedFile = uploadedFile
        )
    }
}

internal suspend fun <T> retryFailedTaskAttachments(
    taskId: String,
    failures: List<AttachmentUploadFailure<T>>,
    uploadFile: suspend (T) -> UploadedTaskFile,
    attachFile: suspend (String, T, UploadedTaskFile) -> Unit
): List<AttachmentUploadFailure<T>> = uploadAndAttachFiles(
    taskId = taskId,
    attachments = failures.map { it.attachment },
    uploadFile = uploadFile,
    attachFile = attachFile,
    previouslyUploadedFiles = failures.map { it.uploadedFile }
)

private suspend fun <T> uploadAndAttachFiles(
    taskId: String,
    attachments: List<T>,
    uploadFile: suspend (T) -> UploadedTaskFile,
    attachFile: suspend (String, T, UploadedTaskFile) -> Unit,
    previouslyUploadedFiles: List<UploadedTaskFile?> = emptyList()
): List<AttachmentUploadFailure<T>> {
    val failures = mutableListOf<AttachmentUploadFailure<T>>()
    attachments.forEachIndexed { index, attachment ->
        var uploadedFile = previouslyUploadedFiles.getOrNull(index)
        try {
            if (uploadedFile == null) uploadedFile = uploadFile(attachment)
            attachFile(taskId, attachment, uploadedFile)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            failures += AttachmentUploadFailure(
                attachment = attachment,
                message = error.message ?: "Attachment upload failed.",
                uploadedFile = uploadedFile
            )
        }
    }
    return failures
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

data class AttachmentUploadFailure<T>(
    val attachment: T,
    val message: String,
    val uploadedFile: UploadedTaskFile? = null
)

data class TaskSubmissionResult<T>(
    val task: CreatedCrmTask,
    val attachmentFailures: List<AttachmentUploadFailure<T>>,
    val voiceNoteFailure: VoiceNoteUploadFailure? = null
)

data class VoiceNoteDraft(val file: File, val durationSeconds: Int)

data class VoiceNoteUploadFailure(
    val voiceNote: VoiceNoteDraft,
    val message: String,
    val uploadedFile: UploadedTaskFile? = null
)

data class TaskUploadRetryResult(
    val attachmentFailures: List<AttachmentUploadFailure<TaskAttachment>>,
    val voiceNoteFailure: VoiceNoteUploadFailure?
)

data class EmployeeSearchState(
    val query: String = "",
    val employees: List<EmployeeOption> = emptyList(),
    val isLoading: Boolean = false,
    val error: String = ""
)
