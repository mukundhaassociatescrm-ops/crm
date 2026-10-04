package com.techzeno.crmtracker.data

import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.call.CallStatus
import com.techzeno.crmtracker.call.CallType
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

class CallRepositoryTest {
    @Test
    fun localDayRangeUsesDeviceLocalMidnightAcrossDaylightSavingChange() {
        val zone = ZoneId.of("America/Los_Angeles")
        val now = Instant.parse("2024-03-10T19:00:00Z").toEpochMilli()

        val range = localDayRange(now, zone)

        assertEquals(Instant.parse("2024-03-10T08:00:00Z").toEpochMilli(), range.startTime)
        assertEquals(Instant.parse("2024-03-11T07:00:00Z").toEpochMilli(), range.endTime)
    }

    @Test
    fun deduplicatePersistedCallsRemovesRepeatedRoomRowsAndKeepsDistinctCalls() {
        val call = CallEvent(
            id = 1,
            phoneNumber = "+911234567890",
            callType = CallType.INCOMING,
            startTime = 1_700_000_000_000L,
            endTime = 1_700_000_060_000L,
            duration = 60_000L,
            status = CallStatus.ENDED
        )
        val duplicate = call.copy(id = 2, endTime = call.endTime + 500L, duration = call.duration + 500L)
        val anotherCall = call.copy(id = 3, startTime = call.startTime + 1_000L)

        assertEquals(listOf(call, anotherCall), deduplicatePersistedCalls(listOf(call, duplicate, anotherCall)))
    }
}
