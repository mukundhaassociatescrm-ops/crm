package com.techzeno.crmtracker.data

import android.content.Context
import com.techzeno.crmtracker.call.CallEvent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import timber.log.Timber

class CallRepository private constructor(private val db: CallDatabase) {
    private val dao = db.callDao()

    suspend fun insert(call: CallEvent): Long = withContext(Dispatchers.IO) {
        Timber.d("CallRepository.insert: %s", call)
        dao.insert(call)
    }

    fun getAllCallsFlow(): Flow<List<CallEvent>> = dao.getAllFlow()

    suspend fun getAllCalls(): List<CallEvent> = withContext(Dispatchers.IO) { dao.getAll() }

    fun getLatestCallFlow(): Flow<CallEvent?> = dao.getLatestFlow()

    suspend fun getLatestCall(): CallEvent? = withContext(Dispatchers.IO) { dao.getLatest() }

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
