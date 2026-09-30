package com.techzeno.crmtracker.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.techzeno.crmtracker.call.CallEvent
import kotlinx.coroutines.flow.Flow

@Dao
interface CallDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(call: CallEvent): Long

    @Query("SELECT * FROM call_events ORDER BY startTime DESC")
    fun getAllFlow(): Flow<List<CallEvent>>

    @Query("SELECT * FROM call_events ORDER BY startTime DESC")
    suspend fun getAll(): List<CallEvent>

    @Query("SELECT * FROM call_events ORDER BY startTime DESC LIMIT 1")
    fun getLatestFlow(): Flow<CallEvent?>

    @Query("SELECT * FROM call_events ORDER BY startTime DESC LIMIT 1")
    suspend fun getLatest(): CallEvent?
}
