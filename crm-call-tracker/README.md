# CRM Call Tracker (Android)

Project purpose
- Android companion app for the CRM with persistent device call history, admin task creation, attachments, and voice notes.

Architecture
- Android CallLog -> CallLogSynchronizer -> CallRepository -> Room -> ViewModel -> Compose UI

Build
- Open the `crm-call-tracker` folder in Android Studio and build the project.

Install on device
- Use Android Studio to run on a physical device. Ensure developer options and USB debugging are enabled.

Required permissions
- `READ_PHONE_STATE`, `READ_CALL_LOG`, `READ_PHONE_NUMBERS` (requested at runtime).

How call history sync works
- Android's saved call log is the source of truth for phone numbers, direction, and connected duration. Voicemail entries are excluded; missed, rejected, and blocked calls are displayed as missed.
- History is reconciled at application startup, activity resume, permission changes, manual refresh, and call-log changes while the process is alive.
- The manifest `CallStateReceiver` requests reconciliation after a call ends, with short retries because the dialer can save a call after the IDLE broadcast.
- Each imported call has a unique Android call-log ID. Repeated syncs update existing rows rather than duplicating them.
- Database version 2 migrates existing history without deleting it. Nearby matching legacy records are linked to imported calls; unmatched existing records remain.
- Database version 3 adds persistent call-to-task links. Tasks created from a call show a green "Task created: <task ID>" label in Calls and call details, including when an attachment upload needs retrying. Multiple tasks are listed separately and call-log sync does not remove these links.
- Older tasks cannot be linked automatically because they did not store an exact call association; matching by phone number alone would incorrectly label other calls from the same customer. Tasks created independently from the Tasks tab are not attached to a call.
- Sync never removes local history when the device log is empty, unavailable, or permission is denied. The dashboard shows sync progress, permission requirements, or errors instead of an unconditional "Running" status.

Android version limitations
- READ_CALL_LOG must be granted. Manufacturer background restrictions and force-stop can delay background updates; reopening the app recovers calls still present in Android's call log.
- Rejected and blocked calls cannot be distinguished from missed calls in the current UI.

Known limitations
- Local phone history is not automatically uploaded to the CRM. CRM API integration currently covers admin login and tasks, including attachments and voice notes.
- Calls absent from both Android's call log and the local database cannot be recovered.
- Clearing app data or uninstalling deletes local history. Reinstalling can only recover calls still present in the device call log.

Future CRM API integration plan
- `CallSyncRepository` remains a placeholder for uploading local call events to the CRM backend.

Validation
- Run `.\gradlew.bat testDebugUnitTest --tests "com.techzeno.crmtracker.data.DeviceCallLogTest" --tests "com.techzeno.crmtracker.data.CallRepositoryTest" assembleDebug`.
- On a physical phone, grant call-log permission and check incoming, outgoing, missed, and rejected calls against the system Phone app.
- Close and reopen the app, rotate the screen, and restart the phone. Previously saved calls should remain, and calls made while the app was closed should appear on reopening.
- Refresh repeatedly: call counts and rows should not duplicate. Deny call-log permission and refresh: saved history should remain and the dashboard should report the missing permission.
- Install a same-signature upgrade over version 1 without uninstalling or clearing app data to verify the on-device Room migration.
