package com.techzeno.crmtracker.ui

import com.techzeno.crmtracker.data.CreatedCrmTask
import com.techzeno.crmtracker.data.TASK_UPLOAD_FIELD_NAME
import com.techzeno.crmtracker.data.VOICE_NOTE_MIME_TYPE
import com.techzeno.crmtracker.data.UploadedTaskFile
import com.techzeno.crmtracker.data.buildVoiceNoteAttachmentPayload
import kotlinx.coroutines.runBlocking
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskAttachmentWorkflowTest {
    private val task = CreatedCrmTask(id = "task-1", displayId = "TSK-1")

    @Test
    fun callLinkIsSavedBeforeUploadsEvenWhenUploadFails() = runBlocking {
        val events = mutableListOf<String>()
        val result = createTaskAndAttachFiles(
            attachments = listOf("quote.pdf"),
            createTask = { events += "create"; task },
            onTaskCreated = { created ->
                assertEquals(task, created)
                events += "link"
            },
            uploadFile = { events += "upload"; error("Offline") },
            attachFile = { _, _, _ -> error("Failed upload should not attach") }
        )
        assertEquals(listOf("create", "link", "upload"), events)
        assertEquals(task, result.task)
        assertEquals(1, result.attachmentFailures.size)
    }

    @Test
    fun failedTaskCreationDoesNotSaveCallLink() = runBlocking {
        var linked = false
        val failure = runCatching {
            createTaskAndAttachFiles(
                attachments = emptyList<String>(),
                createTask = { error("Server rejected task") },
                onTaskCreated = { linked = true },
                uploadFile = { error("No upload expected") },
                attachFile = { _, _, _ -> error("No attachment expected") }
            )
        }.exceptionOrNull()
        assertTrue(failure != null)
        assertEquals(false, linked)
    }

    @Test
    fun taskWithoutAttachmentsCreatesNormallyWithoutUploadCalls() = runBlocking {
        val events = mutableListOf<String>()
        val result = createTaskAndAttachFiles(
            attachments = emptyList<String>(),
            createTask = { events += "create"; task },
            uploadFile = { error("No files should upload") },
            attachFile = { _, _, _ -> error("No files should attach") }
        )

        assertEquals(listOf("create"), events)
        assertEquals(task, result.task)
        assertTrue(result.attachmentFailures.isEmpty())
    }

    @Test
    fun oneAttachmentUploadsAndAttachesOnlyAfterTaskCreation() = runBlocking {
        val events = mutableListOf<String>()
        val result = createTaskAndAttachFiles(
            attachments = listOf("quote.pdf"),
            createTask = { events += "create"; task },
            uploadFile = { fileName -> events += "upload:$fileName"; uploaded(fileName) },
            attachFile = { taskId, fileName, _ -> events += "attach:$taskId:$fileName" }
        )

        assertEquals(listOf("create", "upload:quote.pdf", "attach:task-1:quote.pdf"), events)
        assertTrue(result.attachmentFailures.isEmpty())
    }

    @Test
    fun multipleAttachmentsAreProcessedSequentially() = runBlocking {
        val events = mutableListOf<String>()
        createTaskAndAttachFiles(
            attachments = listOf("one.pdf", "two.jpg"),
            createTask = { events += "create"; task },
            uploadFile = { fileName -> events += "upload:$fileName"; uploaded(fileName) },
            attachFile = { _, fileName, _ -> events += "attach:$fileName" }
        )

        assertEquals(
            listOf("create", "upload:one.pdf", "attach:one.pdf", "upload:two.jpg", "attach:two.jpg"),
            events
        )
    }

    @Test
    fun oneUploadFailureDoesNotPreventRemainingAttachments() = runBlocking {
        val events = mutableListOf<String>()
        val result = createTaskAndAttachFiles(
            attachments = listOf("one.pdf", "bad.exe", "three.jpg"),
            createTask = { events += "create"; task },
            uploadFile = { fileName ->
                events += "upload:$fileName"
                if (fileName == "bad.exe") error("Unsupported file type")
                uploaded(fileName)
            },
            attachFile = { _, fileName, _ -> events += "attach:$fileName" }
        )

        assertEquals(
            listOf("create", "upload:one.pdf", "attach:one.pdf", "upload:bad.exe", "upload:three.jpg", "attach:three.jpg"),
            events
        )
        assertEquals(listOf("bad.exe"), result.attachmentFailures.map { it.attachment })
        assertEquals("Unsupported file type", result.attachmentFailures.single().message)
    }

    @Test
    fun taskCreationFailureDoesNotAttemptAnyUpload() = runBlocking {
        val events = mutableListOf<String>()
        val expectedError = IllegalStateException("Task creation failed")
        val actualError = runCatching {
            createTaskAndAttachFiles(
                attachments = listOf("quote.pdf"),
                createTask = { events += "create"; throw expectedError },
                uploadFile = { fileName -> events += "upload:$fileName"; uploaded(fileName) },
                attachFile = { _, fileName, _ -> events += "attach:$fileName" }
            )
        }.exceptionOrNull()

        assertSame(expectedError, actualError)
        assertEquals(listOf("create"), events)
    }

    @Test
    fun voiceNoteUploadsAndAttachesSeparatelyAfterTaskCreation() = runBlocking {
        val events = mutableListOf<String>()
        val voiceNote = VoiceNoteDraft(File("task_voice.m4a"), 25)
        val result = createTaskAndAttachFiles(
            attachments = emptyList<String>(),
            createTask = { events += "create"; task },
            uploadFile = { error("Voice note must not enter normal attachments") },
            attachFile = { _, _, _ -> error("Voice note must not enter normal attachments") },
            voiceNote = voiceNote,
            uploadVoiceNote = { note ->
                events += "upload-voice:${note.file.name}:${note.durationSeconds}"
                uploaded(note.file.name)
            },
            attachVoiceNote = { taskId, note, uploadedFile ->
                events += "attach-voice:$taskId:${uploadedFile.fileName}:${note.durationSeconds}"
            }
        )

        assertEquals(
            listOf("create", "upload-voice:task_voice.m4a:25", "attach-voice:task-1:task_voice.m4a:25"),
            events
        )
        assertTrue(result.attachmentFailures.isEmpty())
        assertEquals(null, result.voiceNoteFailure)
    }

    @Test
    fun voiceUploadFailureKeepsCreatedTaskAndCanBeRetried() = runBlocking {
        val events = mutableListOf<String>()
        val voiceNote = VoiceNoteDraft(File("task_voice.m4a"), 25)
        val result = createTaskAndAttachFiles(
            attachments = emptyList<String>(),
            createTask = { events += "create"; task },
            uploadFile = { error("No normal attachments") },
            attachFile = { _, _, _ -> error("No normal attachments") },
            voiceNote = voiceNote,
            uploadVoiceNote = { events += "upload-voice"; error("Upload failed") },
            attachVoiceNote = { _, _, _ -> events += "attach-voice" }
        )

        assertEquals(listOf("create", "upload-voice"), events)
        assertEquals(task, result.task)
        assertEquals("Upload failed", result.voiceNoteFailure?.message)
        assertEquals(null, result.voiceNoteFailure?.uploadedFile)
    }

    @Test
    fun voiceAttachmentFailureRetryDoesNotUploadAudioAgain() = runBlocking {
        val voiceNote = VoiceNoteDraft(File("task_voice.m4a"), 25)
        val uploadedFile = uploaded("task_voice.m4a")
        val events = mutableListOf<String>()
        val failure = VoiceNoteUploadFailure(voiceNote, "Attach request failed", uploadedFile)

        val remainingFailure = retryFailedVoiceNote(
            taskId = task.id,
            failure = failure,
            uploadVoiceNote = { events += "upload"; uploaded(it.file.name) },
            attachVoiceNote = { taskId, note, file -> events += "attach:$taskId:${note.durationSeconds}:${file.url}" }
        )

        assertEquals(listOf("attach:task-1:25:https://files/task_voice.m4a"), events)
        assertEquals(null, remainingFailure)
    }

    @Test
    fun voicePayloadUsesDedicatedFieldsAndAudioMp4() {
        assertEquals(
            mapOf(
                "url" to "https://files/task_voice.m4a",
                "fileName" to "task_voice.m4a",
                "mimeType" to "audio/mp4",
                "durationSeconds" to 25
            ),
            buildVoiceNoteAttachmentPayload(uploaded("task_voice.m4a"), 25)
        )
        assertEquals("audio/mp4", VOICE_NOTE_MIME_TYPE)
    }

    @Test
    fun retryAfterAttachFailureReusesUploadedUrlWithoutUploadingAgain() = runBlocking {
        val file = uploaded("quote.pdf")
        val initialFailure = AttachmentUploadFailure(
            attachment = "quote.pdf",
            message = "Attachment request failed",
            uploadedFile = file
        )
        val events = mutableListOf<String>()

        val remaining = retryFailedTaskAttachments(
            taskId = task.id,
            failures = listOf(initialFailure),
            uploadFile = { name -> events += "upload:$name"; uploaded(name) },
            attachFile = { taskId, name, uploadedFile ->
                events += "attach:$taskId:$name:${uploadedFile.url}"
            }
        )

        assertEquals(listOf("attach:task-1:quote.pdf:https://files/quote.pdf"), events)
        assertTrue(remaining.isEmpty())
    }

    @Test
    fun multipartUsesTheBackendFileFieldName() {
        assertEquals("file", TASK_UPLOAD_FIELD_NAME)
    }

    private fun uploaded(fileName: String) = UploadedTaskFile(
        url = "https://files/$fileName",
        fileName = fileName,
        mimeType = "application/pdf"
    )
}
