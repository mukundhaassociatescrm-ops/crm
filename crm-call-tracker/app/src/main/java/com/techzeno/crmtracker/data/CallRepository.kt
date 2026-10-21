package com.techzeno.crmtracker.data

import android.content.Context
import androidx.paging.PagingSource
import androidx.room.withTransaction
import com.techzeno.crmtracker.call.CallEvent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import timber.log.Timber
import java.time.Instant
import java.time.ZoneId

class CallRepository private constructor(private val db: CallDatabase) {
    private val dao = db.callDao()

    fun getTaskLinksFlow(): Flow<List<CallTaskLink>> = dao.getTaskLinksFlow()

    suspend fun linkTask(callId: Long, task: CreatedCrmTask) = withContext(Dispatchers.IO) {
        require(callId > 0 && task.id.isNotBlank()) { "A saved call and CRM task ID are required." }
        dao.saveTaskLink(CallTaskLink(callId, task.id, task.displayId))
    }

    suspend fun insert(call: CallEvent): Long = withContext(Dispatchers.IO) {
        Timber.d("CallRepository.insert: %s", call)
        dao.insert(call)
    }

    internal suspend fun importDeviceCalls(calls: List<CallEvent>) = db.withTransaction {
        dao.importDeviceCalls(calls)
    }

    fun getAllCallsFlow(): Flow<List<CallEvent>> = dao.getAllFlow().map(::deduplicatePersistedCalls)

    fun getCallsPagingSource(
        callDirection: String,
        missedOnly: Boolean,
        phoneQuery: String
    ): PagingSource<Int, CallEvent> = dao.getCallsPagingSource(callDirection, missedOnly, phoneQuery)

    fun getDashboardRecentCallsFlow(): Flow<List<CallEvent>> =
        dao.getDashboardRecentCallsFlow().map(::deduplicatePersistedCalls)

    suspend fun getAllCalls(): List<CallEvent> = withContext(Dispatchers.IO) {
        deduplicatePersistedCalls(dao.getAll())
    }

    fun getLatestCallFlow(): Flow<CallEvent?> = dao.getLatestFlow()

    suspend fun getLatestCall(): CallEvent? = withContext(Dispatchers.IO) { dao.getLatest() }

    fun getCallActivityBetween(startTime: Long, endTime: Long): Flow<TodayCallActivity> =
        dao.getCallActivityBetween(startTime, endTime)

    companion object {
        @Volatile
        private var INSTANCE: CallRepository? = null

        fun init(context: Context) {
            if (INSTANCE == null) {
                synchronized(this) {
                    val db = CallDatabase.getInstance(context)
                    INSTANCE = CallRepository(db)
                }
            }
        }

        fun getInstance(): CallRepository {
            return INSTANCE ?: throw IllegalStateException("CallRepository not initialized")
        }
    }
}

data class TodayCallActivity(
    val totalCalls: Int = 0,
    val incomingCalls: Int = 0,
    val outgoingCalls: Int = 0,
    val missedCalls: Int = 0
)

data class LocalDayRange(val startTime: Long, val endTime: Long)

internal fun localDayRange(nowMillis: Long, zoneId: ZoneId = ZoneId.systemDefault()): LocalDayRange {
    val today = Instant.ofEpochMilli(nowMillis).atZone(zoneId).toLocalDate()
    return LocalDayRange(
        startTime = today.atStartOfDay(zoneId).toInstant().toEpochMilli(),
        endTime = today.plusDays(1).atStartOfDay(zoneId).toInstant().toEpochMilli()
    )
}

internal fun deduplicatePersistedCalls(calls: List<CallEvent>): List<CallEvent> =
    calls.distinctBy { listOf(it.sourceCallId, it.phoneNumber, it.callType, it.startTime) }
