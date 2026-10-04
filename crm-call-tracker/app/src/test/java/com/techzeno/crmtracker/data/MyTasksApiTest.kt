package com.techzeno.crmtracker.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MyTasksApiTest {
    @Test
    fun parseCallTrackerTasksMapsFieldsAndExcludesCrmTasks() {
        val response = JSONObject(
            """
            {
              "success": true,
              "count": 2,
              "data": [
                {
                  "_id": "task-call-tracker",
                  "createdFrom": "CALL_TRACKER",
                  "title": "Call customer",
                  "description": "Discuss renewal",
                  "customerName": "A Customer",
                  "customerPhone": "+911234567890",
                  "assignedTo": { "fullName": "An Employee" },
                  "status": "Pending",
                  "priority": "High",
                  "dueDate": "2026-10-10T10:00:00.000Z",
                  "createdAt": "2026-10-04T08:30:00.000Z"
                },
                {
                  "_id": "task-crm",
                  "createdFrom": "CRM",
                  "title": "CRM task"
                }
              ]
            }
            """.trimIndent()
        )

        val tasks = parseCallTrackerTasks(response)

        assertEquals(1, tasks.size)
        assertEquals("task-call-tracker", tasks.single().id)
        assertEquals("Call customer", tasks.single().title)
        assertEquals("Discuss renewal", tasks.single().description)
        assertEquals("A Customer", tasks.single().customerName)
        assertEquals("+911234567890", tasks.single().customerPhone)
        assertEquals("An Employee", tasks.single().assignedEmployee)
        assertEquals("Pending", tasks.single().status)
        assertEquals("High", tasks.single().priority)
        assertEquals("2026-10-10T10:00:00.000Z", tasks.single().dueDate)
        assertEquals("2026-10-04T08:30:00.000Z", tasks.single().createdAt)
    }

    @Test
    fun parseCallTrackerTasksReturnsEmptyForNoTasks() {
        assertEquals(emptyList<CallTrackerTask>(), parseCallTrackerTasks(JSONObject("""{"success":true,"count":0,"data":[]}""")))
    }

    @Test
    fun apiErrorsAreExposedWithServerMessage() {
        val error = assertThrows(CrmApiException::class.java) {
            parseApiResponse(503, """{"success":false,"message":"Tasks unavailable"}""")
        }

        assertEquals(503, error.statusCode)
        assertEquals("Tasks unavailable", error.message)
    }

    @Test
    fun taskListUsesCallTrackerSourceFilter() {
        assertEquals("/api/tasks?createdFrom=CALL_TRACKER", CALL_TRACKER_TASKS_PATH)
    }
}
