package com.techzeno.crmtracker.data

import android.content.ContentResolver
import android.provider.CallLog
import com.techzeno.crmtracker.ContactMatchHelper
import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.call.CallStatus
import com.techzeno.crmtracker.call.CallType
import java.io.IOException
import kotlin.math.abs

internal fun readDeviceCallLog(contentResolver: ContentResolver): List<CallEvent> {
    val projection = arrayOf(
        CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.TYPE,
        CallLog.Calls.DATE, CallLog.Calls.DURATION
    )
    val cursor = contentResolver.query(
        CallLog.Calls.CONTENT_URI, projection, null, null, "${CallLog.Calls.DATE} DESC"
    ) ?: throw IOException("Android call history is unavailable. Please retry.")
    return cursor.use {
        val id = it.getColumnIndexOrThrow(CallLog.Calls._ID)
        val number = it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
        val type = it.getColumnIndexOrThrow(CallLog.Calls.TYPE)
        val date = it.getColumnIndexOrThrow(CallLog.Calls.DATE)
        val duration = it.getColumnIndexOrThrow(CallLog.Calls.DURATION)
        buildList {
            while (it.moveToNext()) {
                deviceCallEvent(
                    it.getLong(id), it.getString(number), it.getInt(type),
                    it.getLong(date), it.getLong(duration)
                )?.let(::add)
            }
        }
    }
}

internal fun deviceCallEvent(
    sourceCallId: Long,
    phoneNumber: String?,
    type: Int,
    startTime: Long,
    durationSeconds: Long
): CallEvent? {
    val direction = when (type) {
        CallLog.Calls.OUTGOING_TYPE -> CallType.OUTGOING
        CallLog.Calls.INCOMING_TYPE, CallLog.Calls.MISSED_TYPE,
        CallLog.Calls.REJECTED_TYPE, CallLog.Calls.BLOCKED_TYPE,
        CallLog.Calls.ANSWERED_EXTERNALLY_TYPE -> CallType.INCOMING
        else -> return null // Voicemail entries are not phone calls.
    }
    require(sourceCallId > 0 && startTime > 0 && durationSeconds >= 0) {
        "Invalid Android call-log record."
    }
    val missed = type == CallLog.Calls.MISSED_TYPE ||
        type == CallLog.Calls.REJECTED_TYPE || type == CallLog.Calls.BLOCKED_TYPE
    val duration = if (missed) 0L else Math.multiplyExact(durationSeconds, 1_000L)
    return CallEvent(
        phoneNumber = phoneNumber?.takeIf(String::isNotBlank),
        callType = direction,
        startTime = startTime,
        endTime = Math.addExact(startTime, duration),
        duration = duration,
        status = if (missed) CallStatus.MISSED else CallStatus.ENDED,
        sourceCallId = sourceCallId
    )
}

internal const val LEGACY_CALL_MATCH_WINDOW_MS = 5_000L

internal suspend fun CallDao.importDeviceCalls(calls: List<CallEvent>) {
    for (call in calls) {
        val sourceCallId = requireNotNull(call.sourceCallId)
        val existing = getBySourceCallId(sourceCallId)
            ?: findLegacyCall(
                call,
                getLegacyCallsBetween(
                    call.startTime - LEGACY_CALL_MATCH_WINDOW_MS,
                    call.startTime + LEGACY_CALL_MATCH_WINDOW_MS
                )
            )
        if (existing == null) {
            check(insert(call) != -1L) { "Unable to save Android call-log record." }
        } else {
            val updated = call.copy(id = existing.id)
            if (updated != existing) update(updated)
        }
    }
}

internal fun findLegacyCall(source: CallEvent, candidates: List<CallEvent>): CallEvent? =
    candidates.filter {
        it.sourceCallId == null &&
            it.callType == source.callType &&
            abs(it.startTime - source.startTime) <= LEGACY_CALL_MATCH_WINDOW_MS &&
            (it.phoneNumber.isNullOrBlank() ||
                ContactMatchHelper.normalizePhoneNumber(it.phoneNumber) ==
                ContactMatchHelper.normalizePhoneNumber(source.phoneNumber))
    }.minByOrNull { abs(it.startTime - source.startTime) }
