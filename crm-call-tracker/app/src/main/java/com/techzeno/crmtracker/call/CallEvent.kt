package com.techzeno.crmtracker.call

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class CallType { INCOMING, OUTGOING, UNKNOWN }
enum class CallStatus { RINGING, ANSWERED, ENDED, MISSED }

@Entity(tableName = "call_events")
data class CallEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val phoneNumber: String? = null,
    val callType: CallType = CallType.UNKNOWN,
    val startTime: Long = 0L,
    val endTime: Long = 0L,
    val duration: Long = 0L,
    val status: CallStatus = CallStatus.ENDED
)
