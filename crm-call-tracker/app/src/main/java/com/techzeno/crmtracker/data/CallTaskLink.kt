package com.techzeno.crmtracker.data

import androidx.room.Entity

@Entity(tableName = "call_task_links", primaryKeys = ["callId", "taskId"])
data class CallTaskLink(
    val callId: Long,
    val taskId: String,
    val displayId: String
) {
    val label: String
        get() = "Task created: ${displayId.ifBlank { taskId }}"
}
