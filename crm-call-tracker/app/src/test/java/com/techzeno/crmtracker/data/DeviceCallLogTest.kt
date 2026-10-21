package com.techzeno.crmtracker.data

import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.call.CallStatus
import com.techzeno.crmtracker.call.CallType
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.lang.reflect.Proxy

class DeviceCallLogTest {
    private fun call(sourceId: Long = 10, type: Int = 1, durationSeconds: Long = 30): CallEvent =
        requireNotNull(deviceCallEvent(sourceId, "+919876543210", type, 1_700_000_000_000L, durationSeconds))

    @Test
    fun importsConnectedDurationInMillisecondsAndPreservesSourceIdentity() {
        val incoming = call()
        assertEquals(30_000L, incoming.duration)
        assertEquals(incoming.startTime + 30_000L, incoming.endTime)
        assertEquals(10L, incoming.sourceCallId)
        assertEquals(CallType.INCOMING, incoming.callType)
        assertEquals(CallStatus.ENDED, incoming.status)
        assertEquals(CallType.OUTGOING, call(type = 2).callType)
    }

    @Test
    fun missedRejectedAndBlockedCallsHaveZeroConnectedDuration() {
        for (type in listOf(3, 5, 6)) {
            val missed = call(type = type)
            assertEquals(CallType.INCOMING, missed.callType)
            assertEquals(CallStatus.MISSED, missed.status)
            assertEquals(0L, missed.duration)
        }
    }

    @Test
    fun preservesUnknownNumbersAndExcludesVoicemail() {
        assertNull(deviceCallEvent(1, "", 1, 1_000, 0)?.phoneNumber)
        assertNull(deviceCallEvent(2, "123", 4, 1_000, 0))
        assertEquals(CallStatus.ENDED, call(type = 7).status)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsInvalidCallLogData() {
        deviceCallEvent(0, "123", 1, 1_000, -1)
    }

    @Test
    fun repeatedSyncAndRecreatedImporterDoNotDuplicateOrResetHistory() = runBlocking {
        val store = TestCallStore()
        store.dao().importDeviceCalls(listOf(call()))
        val original = store.rows.values.single()
        store.dao().importDeviceCalls(listOf(call()))
        assertEquals(listOf(original), store.rows.values.toList())
        assertEquals(0, store.updates)
    }

    @Test
    fun emptyDeviceLogDoesNotDeletePreviouslySavedCalls() = runBlocking {
        val store = TestCallStore()
        store.dao().importDeviceCalls(listOf(call()))
        val original = store.rows.values.toList()
        store.dao().importDeviceCalls(emptyList())
        assertEquals(original, store.rows.values.toList())
    }

    @Test
    fun laterProviderUpdatesKeepTheSameLocalRecord() = runBlocking {
        val store = TestCallStore()
        store.dao().importDeviceCalls(listOf(call(durationSeconds = 0)))
        val originalId = store.rows.values.single().id
        store.dao().importDeviceCalls(listOf(call(durationSeconds = 45)))
        assertEquals(1, store.rows.size)
        assertEquals(originalId, store.rows.values.single().id)
        assertEquals(45_000L, store.rows.values.single().duration)
    }

    @Test
    fun backfillLinksLegacyRecordWithoutDiscardingOtherHistory() = runBlocking {
        val source = call()
        val legacy = source.copy(id = 1, sourceCallId = null, phoneNumber = "9876543210")
        val unrelated = legacy.copy(id = 2, startTime = source.startTime - 60_000L)
        val store = TestCallStore(listOf(legacy, unrelated))
        store.dao().importDeviceCalls(listOf(source))
        assertEquals(2, store.rows.size)
        assertEquals(source.copy(id = 1), store.rows[1])
        assertEquals(unrelated, store.rows[2])
    }

    @Test
    fun legacyMatchingUsesNearestCompatibleCallAndDoesNotMergeDistinctSourceCalls() {
        val source = call()
        val nearby = source.copy(id = 1, sourceCallId = null, startTime = source.startTime + 2_000)
        val nearest = nearby.copy(id = 2, startTime = source.startTime + 1_000)
        assertEquals(nearest, findLegacyCall(source, listOf(nearby, nearest)))
        assertNull(findLegacyCall(source, listOf(
            source,
            nearby.copy(phoneNumber = "1111111111"),
            nearby.copy(callType = CallType.OUTGOING),
            nearby.copy(startTime = source.startTime + 5_001)
        )))
    }

    @Test
    fun distinctProviderIdsRemainDistinctEvenWithSameNumberAndTimestamp() = runBlocking {
        val store = TestCallStore()
        store.dao().importDeviceCalls(listOf(call(10), call(11)))
        assertEquals(2, store.rows.size)
        assertEquals(2, deduplicatePersistedCalls(store.rows.values.toList()).size)
    }

    private class TestCallStore(initial: List<CallEvent> = emptyList()) {
        val rows = initial.associateByTo(linkedMapOf()) { it.id }
        var updates = 0
            private set

        fun dao(): CallDao = requireNotNull(CallDao::class.java.cast(
            Proxy.newProxyInstance(CallDao::class.java.classLoader, arrayOf(CallDao::class.java)) { _, method, args ->
                when (method.name) {
                    "getBySourceCallId" -> rows.values.firstOrNull { it.sourceCallId == args[0] }
                    "getLegacyCallsBetween" -> rows.values.filter {
                        it.sourceCallId == null && it.startTime in (args[0] as Long)..(args[1] as Long)
                    }
                    "insert" -> {
                        val value = args[0] as CallEvent
                        val id = (rows.keys.maxOrNull() ?: 0L) + 1
                        rows[id] = value.copy(id = id)
                        id
                    }
                    "update" -> {
                        val value = args[0] as CallEvent
                        rows[value.id] = value
                        updates++
                        Unit
                    }
                    else -> error("Unexpected DAO operation: ${method.name}")
                }
            }
        ))
    }
}
