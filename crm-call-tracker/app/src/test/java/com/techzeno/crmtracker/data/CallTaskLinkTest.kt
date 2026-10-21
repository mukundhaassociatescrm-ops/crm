package com.techzeno.crmtracker.data

import org.junit.Assert.assertEquals
import org.junit.Test

class CallTaskLinkTest {
    @Test
    fun labelUsesCrmDisplayId() {
        assertEquals("Task created: TSK-42", CallTaskLink(1, "internal-id", "TSK-42").label)
    }

    @Test
    fun labelFallsBackToInternalIdWhenDisplayIdIsUnavailable() {
        assertEquals("Task created: internal-id", CallTaskLink(1, "internal-id", "").label)
    }
}
