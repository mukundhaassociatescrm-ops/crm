package com.techzeno.crmtracker.data

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import org.junit.Assert.assertEquals
import org.junit.Test

class CreateTaskPayloadTest {
    @Test
    fun buildCreateTaskPayloadUsesBackendFieldsAndSelectedEmployeeId() {
        val dueDateMillis = 1_791_113_100_000L
        val payload = buildCreateTaskPayload(
            title = "Call customer",
            description = "Discuss renewal",
            assignedToId = "64a2f1f2de0edc1234d56789",
            customerName = "A Customer",
            customerPhone = "+911234567890",
            dueDateMillis = dueDateMillis
        )

        assertEquals(
            setOf("title", "createdFrom", "description", "assignedTo", "dueDate", "customerName", "customerPhone"),
            payload.keys
        )
        assertEquals("Call customer", payload["title"])
        assertEquals("CALL_TRACKER", payload["createdFrom"])
        assertEquals("Discuss renewal", payload["description"])
        assertEquals("64a2f1f2de0edc1234d56789", payload["assignedTo"])
        assertEquals("A Customer", payload["customerName"])
        assertEquals("+911234567890", payload["customerPhone"])
        assertEquals(
            DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                Instant.ofEpochMilli(dueDateMillis).atZone(ZoneId.systemDefault())
            ),
            payload["dueDate"]
        )
    }

    @Test
    fun buildCreateTaskPayloadOmitsBlankOptionalCustomerFields() {
        val payload = buildCreateTaskPayload(
            title = "Internal follow-up",
            description = "",
            assignedToId = "64a2f1f2de0edc1234d56789",
            customerName = " ",
            customerPhone = "",
            dueDateMillis = 1_791_113_100_000L
        )

        assertEquals(setOf("title", "createdFrom", "description", "assignedTo", "dueDate"), payload.keys)
        assertEquals("CALL_TRACKER", payload["createdFrom"])
    }
}
