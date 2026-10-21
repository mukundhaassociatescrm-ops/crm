package com.techzeno.crmtracker.data

import android.content.Context
import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

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
        dueDate: LocalDate
    ): CreatedCrmTask = withContext(Dispatchers.IO) {
        val body = buildCreateTaskPayload(
            title = title,
            description = description,
            assignedToId = assignedToId,
            customerName = customerName,
            customerPhone = customerPhone,
            dueDate = dueDate
        )
        val response = request("/api/tasks", "POST", token, JSONObject(body))
        val task = response.optJSONObject("data") ?: throw IOException("Invalid task response.")
        CreatedCrmTask(id = task.optString("_id"), displayId = task.optString("displayId"))
    }

    suspend fun uploadTaskAttachmentFile(
        contentResolver: ContentResolver,
        token: String,
        uri: Uri,
        fallbackFileName: String,
        fallbackMimeType: String?
    ): UploadedTaskFile {
        val fileName = resolveAttachmentFileName(contentResolver, uri, fallbackFileName)
        val mimeType = contentResolver.getType(uri)
            ?: fallbackMimeType
            ?: "application/octet-stream"
        return uploadMultipartFile(token, fileName, mimeType) {
            contentResolver.openInputStream(uri)
        }
    }

    suspend fun uploadVoiceNoteFile(token: String, file: File): UploadedTaskFile =
        uploadMultipartFile(token, file.name, VOICE_NOTE_MIME_TYPE) { file.inputStream() }

    private suspend fun uploadMultipartFile(
        token: String,
        fileName: String,
        mimeType: String,
        openInputStream: () -> InputStream?
    ): UploadedTaskFile = withContext(Dispatchers.IO) {
        val boundary = "CRMCallTracker-${UUID.randomUUID()}"
        val connection = (URL(baseUrl.trimEnd('/') + "/api/files/upload").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 30_000
            doOutput = true
            setChunkedStreamingMode(8 * 1024)
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("Authorization", "Bearer $token")
        }

        try {
            connection.outputStream.use { output ->
                output.write("--$boundary\r\n".toByteArray(Charsets.UTF_8))
                output.write(
                    "Content-Disposition: form-data; name=\"$TASK_UPLOAD_FIELD_NAME\"; filename=\"${escapeMultipartFilename(fileName)}\"\r\n"
                        .toByteArray(Charsets.UTF_8)
                )
                output.write("Content-Type: $mimeType\r\n\r\n".toByteArray(Charsets.UTF_8))
                val input = openInputStream()
                    ?: throw IOException("Unable to open selected file: $fileName")
                input.use { it.copyTo(output) }
                output.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val response = parseApiResponse(status, body)
            val data = response.optJSONObject("data") ?: throw IOException("Invalid file upload response.")
            val url = data.optString("url")
            if (url.isBlank()) throw IOException("The upload response did not include a file URL.")
            UploadedTaskFile(
                url = url,
                fileName = data.optString("filename").takeIf(String::isNotBlank) ?: fileName,
                mimeType = data.optString("mimeType").takeIf(String::isNotBlank) ?: mimeType
            )
        } finally {
            connection.disconnect()
        }
    }

    suspend fun attachUploadedTaskFile(
        token: String,
        taskId: String,
        file: UploadedTaskFile
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("url", file.url)
            .put("fileName", file.fileName)
            .put("mimeType", file.mimeType)
        request("/api/tasks/${Uri.encode(taskId)}/attachments", "POST", token, body)
    }

    suspend fun attachTaskVoiceNote(
        token: String,
        taskId: String,
        file: UploadedTaskFile,
        durationSeconds: Int
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject(buildVoiceNoteAttachmentPayload(file, durationSeconds))
        request("/api/tasks/${Uri.encode(taskId)}/voice-note", "POST", token, body)
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
internal const val TASK_UPLOAD_FIELD_NAME = "file"
internal const val VOICE_NOTE_MIME_TYPE = "audio/mp4"

internal fun buildVoiceNoteAttachmentPayload(
    file: UploadedTaskFile,
    durationSeconds: Int
): Map<String, Any> = mapOf(
    "url" to file.url,
    "fileName" to file.fileName,
    "mimeType" to VOICE_NOTE_MIME_TYPE,
    "durationSeconds" to durationSeconds.coerceAtLeast(0)
)

private fun resolveAttachmentFileName(
    contentResolver: ContentResolver,
    uri: Uri,
    fallbackFileName: String
): String {
    val displayName = contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME))
        } else {
            null
        }
    }
    return displayName?.takeIf(String::isNotBlank)
        ?: fallbackFileName.takeIf(String::isNotBlank)
        ?: "attachment"
}

private fun escapeMultipartFilename(fileName: String): String =
    fileName.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "").replace("\n", "")

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
    dueDate: LocalDate
): Map<String, Any> {
    val body = linkedMapOf<String, Any>(
        "title" to title,
        "createdFrom" to "CALL_TRACKER",
        "description" to description,
        "assignedTo" to assignedToId,
        "dueDate" to dueDate.toString()
    )
    if (customerName.isNotBlank()) body["customerName"] = customerName
    if (customerPhone.isNotBlank()) body["customerPhone"] = customerPhone
    return body
}

internal fun datePickerMillis(date: LocalDate): Long =
    date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

internal fun localDateFromDatePickerMillis(dateMillis: Long): LocalDate =
    Instant.ofEpochMilli(dateMillis).atZone(ZoneOffset.UTC).toLocalDate()

internal fun localDateFromTaskDueDate(value: String?): LocalDate? {
    val datePart = value?.take(10) ?: return null
    return runCatching { LocalDate.parse(datePart) }.getOrNull()
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
data class UploadedTaskFile(val url: String, val fileName: String, val mimeType: String)

class CrmApiException(val statusCode: Int, message: String) : IOException(message)
