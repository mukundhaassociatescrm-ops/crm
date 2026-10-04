package com.techzeno.crmtracker.data

import android.content.Context
import android.net.Uri
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class CrmApiRepository(private val baseUrl: String) {
    suspend fun getCallTrackerTasks(token: String): List<CallTrackerTask> = withContext(Dispatchers.IO) {
        val response = request(CALL_TRACKER_TASKS_PATH, "GET", token)
        parseCallTrackerTasks(response)
    }

    suspend fun login(email: String, password: String): AdminSession = withContext(Dispatchers.IO) {
        val response = request(
            path = "/api/auth/login",
            method = "POST",
            body = JSONObject().put("email", email).put("password", password)
        )
        val data = response.optJSONObject("data") ?: throw IOException("Invalid login response.")
        val user = data.optJSONObject("user") ?: throw IOException("Invalid login response.")
        val token = data.optString("token")
        if (token.isBlank()) throw IOException("The server did not return an authentication token.")
        if (!user.optString("role").equals("admin", ignoreCase = true)) {
            throw CrmApiException(403, "This app is restricted to CRM admin accounts.")
        }
        AdminSession(
            token = token,
            name = user.optString("name"),
            email = user.optString("email", email)
        )
    }

    suspend fun searchEmployees(token: String, search: String): List<EmployeeOption> = withContext(Dispatchers.IO) {
        val encodedSearch = Uri.encode(search)
        val response = request(
            path = "/api/employees?search=$encodedSearch&status=true",
            method = "GET",
            token = token
        )
        val employees = response.optJSONArray("data") ?: return@withContext emptyList()
        buildList {
            for (index in 0 until employees.length()) {
                val employee = employees.optJSONObject(index) ?: continue
                val id = employee.optString("_id")
                val name = employee.optString("fullName")
                if (id.isNotBlank() && name.isNotBlank()) {
                    add(EmployeeOption(id = id, fullName = name, email = employee.optString("email")))
                }
            }
        }
    }

    suspend fun createTask(
        token: String,
        title: String,
        description: String,
        assignedToId: String,
        customerName: String,
        customerPhone: String,
        dueDateMillis: Long
    ): CreatedCrmTask = withContext(Dispatchers.IO) {
        val body = buildCreateTaskPayload(
            title = title,
            description = description,
            assignedToId = assignedToId,
            customerName = customerName,
            customerPhone = customerPhone,
            dueDateMillis = dueDateMillis
        )
        val response = request("/api/tasks", "POST", token, JSONObject(body))
        val task = response.optJSONObject("data") ?: throw IOException("Invalid task response.")
        CreatedCrmTask(id = task.optString("_id"), displayId = task.optString("displayId"))
    }

    private fun request(
        path: String,
        method: String,
        token: String? = null,
        body: JSONObject? = null
    ): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            if (!token.isNullOrBlank()) setRequestProperty("Authorization", "Bearer $token")
        }

        try {
            if (body != null) {
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return parseApiResponse(status, text)
        } finally {
            connection.disconnect()
        }
    }
}

internal const val CALL_TRACKER_TASKS_PATH = "/api/tasks?createdFrom=CALL_TRACKER"

internal fun parseCallTrackerTasks(response: JSONObject): List<CallTrackerTask> {
    val tasks = response.optJSONArray("data") ?: return emptyList()
    return buildList {
        for (index in 0 until tasks.length()) {
            val task = tasks.optJSONObject(index) ?: continue
            if (task.optString("createdFrom") != "CALL_TRACKER") continue

            val assignedTo = task.optJSONObject("assignedTo")
            add(
                CallTrackerTask(
                    id = task.optString("_id"),
                    title = task.optString("title", "Untitled task"),
                    description = task.optString("description", ""),
                    customerName = task.optString("customerName", ""),
                    customerPhone = task.optString("customerPhone", ""),
                    assignedEmployee = assignedTo?.optString("fullName")
                        ?.takeIf(String::isNotBlank)
                        ?: "Unassigned",
                    status = task.optString("status", "Pending"),
                    priority = task.optString("priority", "Medium"),
                    dueDate = task.optString("dueDate").takeUnless { it == "null" || it.isBlank() },
                    createdAt = task.optString("createdAt").takeUnless { it == "null" || it.isBlank() }
                )
            )
        }
    }
}

internal fun parseApiResponse(statusCode: Int, responseBody: String): JSONObject {
    val response = runCatching { JSONObject(responseBody) }.getOrElse { JSONObject() }
    if (statusCode !in 200..299) {
        throw CrmApiException(
            statusCode,
            response.optString("message").ifBlank { "CRM request failed ($statusCode)." }
        )
    }
    if (response.optBoolean("success") == false) {
        throw CrmApiException(statusCode, response.optString("message").ifBlank { "CRM request failed." })
    }
    return response
}

data class CallTrackerTask(
    val id: String,
    val title: String,
    val description: String,
    val customerName: String,
    val customerPhone: String,
    val assignedEmployee: String,
    val status: String,
    val priority: String,
    val dueDate: String?,
    val createdAt: String?
)

internal fun buildCreateTaskPayload(
    title: String,
    description: String,
    assignedToId: String,
    customerName: String,
    customerPhone: String,
    dueDateMillis: Long
): Map<String, Any> {
    val dueDate = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
        Instant.ofEpochMilli(dueDateMillis).atZone(ZoneId.systemDefault())
    )
    val body = linkedMapOf<String, Any>(
        "title" to title,
        "createdFrom" to "CALL_TRACKER",
        "description" to description,
        "assignedTo" to assignedToId,
        "dueDate" to dueDate
    )
    if (customerName.isNotBlank()) body["customerName"] = customerName
    if (customerPhone.isNotBlank()) body["customerPhone"] = customerPhone
    return body
}

class AdminSessionStore(context: Context) {
    private val preferences by lazy {
        EncryptedSharedPreferences.create(
            "crm_admin_session",
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun load(): AdminSession? {
        val token = preferences.getString(KEY_TOKEN, null)?.takeIf(String::isNotBlank) ?: return null
        return AdminSession(
            token = token,
            name = preferences.getString(KEY_NAME, "").orEmpty(),
            email = preferences.getString(KEY_EMAIL, "").orEmpty()
        )
    }

    fun save(session: AdminSession) {
        preferences.edit()
            .putString(KEY_TOKEN, session.token)
            .putString(KEY_NAME, session.name)
            .putString(KEY_EMAIL, session.email)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val KEY_TOKEN = "token"
        const val KEY_NAME = "name"
        const val KEY_EMAIL = "email"
    }
}

data class AdminSession(val token: String, val name: String, val email: String)
data class EmployeeOption(val id: String, val fullName: String, val email: String)
data class CreatedCrmTask(val id: String, val displayId: String)

class CrmApiException(val statusCode: Int, message: String) : IOException(message)
