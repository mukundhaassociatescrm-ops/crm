# CRM Call Tracker (Android)

Project purpose
- Lightweight Android companion app for an existing CRM to detect phone call events locally and store them.

Architecture
- Compose UI -> ViewModel -> Repository -> Call Detection -> Room Database

Build
- Open the `crm-call-tracker` folder in Android Studio and build the project.

Install on device
- Use Android Studio to run on a physical device. Ensure developer options and USB debugging are enabled.

Required permissions
- `READ_PHONE_STATE`, `READ_CALL_LOG`, `READ_PHONE_NUMBERS` (requested at runtime).

How call detection works
- A BroadcastReceiver (`CallStateReceiver`) listens for `ACTION_PHONE_STATE_CHANGED` events, builds `CallEvent` objects and saves them to Room via `CallRepository`.

Android version limitations
- Some modern Android versions restrict implicit broadcast receivers; dynamic registration may be required. READ_CALL_LOG and phone number access may be limited.

Known limitations
- No CRM API integration yet.
- Phone number availability may be limited on newer Android versions.
- Receiver may need to be registered dynamically for reliable operation.

Future CRM API integration plan
- Implement `CallSyncRepository` to push events to the CRM backend.
