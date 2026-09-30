package com.techzeno.crmtracker.data

import com.techzeno.crmtracker.call.CallEvent

/**
 * Interface stub for future CRM sync integration. Do not implement network calls yet.
 */
interface CallSyncRepository {
    suspend fun sync(event: CallEvent)
}
