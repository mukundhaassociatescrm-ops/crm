package com.techzeno.crmtracker.data

import java.time.LocalDate
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Test

class CreateTaskPayloadTest {
    @Test
    fun buildCreateTaskPayloadUsesBackendFieldsAndSelectedEmployeeId() {
        val dueDate = LocalDate.of(2026, 10, 4)
        val payload = buildCreateTaskPayload(
            title = "Call customer",
            description = "Discuss renewal",
            assignedToId = "64a2f1f2de0edc1234d56789",
            customerName = "A Customer",
            customerPhone = "+911234567890",
            dueDate = dueDate
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
        assertEquals("2026-10-04", payload["dueDate"])
        assertEquals(dueDate, localDateFromDatePickerMillis(datePickerMillis(dueDate)))
    }

    @Test
    fun selectedCalendarDateAndPayloadDoNotDependOnDeviceTimezone() {
        val originalTimeZone = TimeZone.getDefault()
        val selectedDate = LocalDate.of(2026, 10, 4)
        try {
            listOf("Pacific/Honolulu", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati")
                .forEach { timeZoneId ->
                    TimeZone.setDefault(TimeZone.getTimeZone(timeZoneId))
                    assertEquals(selectedDate, localDateFromDatePickerMillis(datePickerMillis(selectedDate)))
                    assertEquals(selectedDate, localDateFromTaskDueDate("2026-10-04T00:00:00.000Z"))
                    val payload = buildCreateTaskPayload(
                        title = "Call customer",
                        description = "",
                        assignedToId = "64a2f1f2de0edc1234d56789",
                        customerName = "",
                        customerPhone = "",
                        dueDate = selectedDate
                    )
                    assertEquals("2026-10-04", payload["dueDate"])
                }
        } finally {
            TimeZone.setDefault(originalTimeZone)
        }
    }

    @Test
    fun taskDueDateDisplayParsingPreservesTheCalendarDate() {
        assertEquals(
            LocalDate.of(2026, 10, 4),
            localDateFromTaskDueDate("2026-10-04T00:00:00.000Z")
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
            dueDate = LocalDate.of(2026, 10, 4)
        )

        assertEquals(setOf("title", "createdFrom", "description", "assignedTo", "dueDate"), payload.keys)
        assertEquals("CALL_TRACKER", payload["createdFrom"])
    }
}
