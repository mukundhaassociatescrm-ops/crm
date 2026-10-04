package com.techzeno.crmtracker.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.paging.PagingSource
import androidx.room.Query
import com.techzeno.crmtracker.call.CallEvent
import kotlinx.coroutines.flow.Flow

@Dao
interface CallDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(call: CallEvent): Long

    @Query("SELECT * FROM call_events WHERE status IN ('ENDED', 'MISSED') ORDER BY startTime DESC, id DESC")
    fun getAllFlow(): Flow<List<CallEvent>>

    @Query("SELECT * FROM call_events WHERE status IN ('ENDED', 'MISSED') ORDER BY startTime DESC, id DESC")
    suspend fun getAll(): List<CallEvent>

    @Query("""
        SELECT calls.*
        FROM call_events AS calls
        INNER JOIN (
            SELECT MAX(id) AS id
            FROM call_events
            WHERE status IN ('ENDED', 'MISSED')
            GROUP BY phoneNumber, callType, startTime
        ) AS unique_calls ON unique_calls.id = calls.id
        WHERE (:callDirection = 'All' OR calls.callType = :callDirection)
            AND (:missedOnly = 0 OR calls.status = 'MISSED')
            AND (:phoneQuery = '' OR calls.phoneNumber LIKE '%' || :phoneQuery || '%')
        ORDER BY calls.startTime DESC, calls.id DESC
    """)
    fun getCallsPagingSource(
        callDirection: String,
        missedOnly: Boolean,
        phoneQuery: String
    ): PagingSource<Int, CallEvent>

    @Query("""
        SELECT calls.*
        FROM call_events AS calls
        INNER JOIN (
            SELECT MAX(id) AS id
            FROM call_events
            WHERE status IN ('ENDED', 'MISSED')
            GROUP BY phoneNumber, callType, startTime
        ) AS unique_calls ON unique_calls.id = calls.id
        ORDER BY calls.startTime DESC, calls.id DESC
        LIMIT 5
    """)
    fun getDashboardRecentCallsFlow(): Flow<List<CallEvent>>

    @Query("SELECT * FROM call_events WHERE status IN ('ENDED', 'MISSED') ORDER BY startTime DESC, id DESC LIMIT 1")
    fun getLatestFlow(): Flow<CallEvent?>

    @Query("SELECT * FROM call_events WHERE status IN ('ENDED', 'MISSED') ORDER BY startTime DESC, id DESC LIMIT 1")
    suspend fun getLatest(): CallEvent?

    @Query("""
        SELECT
            COUNT(*) AS totalCalls,
            COALESCE(SUM(CASE WHEN callType = 'INCOMING' THEN 1 ELSE 0 END), 0) AS incomingCalls,
            COALESCE(SUM(CASE WHEN callType = 'OUTGOING' THEN 1 ELSE 0 END), 0) AS outgoingCalls,
            COALESCE(SUM(CASE WHEN status = 'MISSED' THEN 1 ELSE 0 END), 0) AS missedCalls
        FROM (
            SELECT phoneNumber, callType, startTime, MAX(status) AS status
            FROM call_events
            WHERE startTime >= :startTime AND startTime < :endTime
                AND status IN ('ENDED', 'MISSED')
            GROUP BY phoneNumber, callType, startTime
        )
    """)
    fun getCallActivityBetween(startTime: Long, endTime: Long): Flow<TodayCallActivity>
}
