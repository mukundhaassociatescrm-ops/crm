package com.techzeno.crmtracker

import android.content.Context
import android.provider.ContactsContract
import android.database.Cursor
import timber.log.Timber

object ContactMatchHelper {
    fun normalizePhoneNumber(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val digits = raw.filter { it.isDigit() }
        if (digits.isEmpty()) return null
        return if (digits.length > 10) digits.takeLast(10) else digits
    }

    fun lookupContactName(context: Context, phoneNumber: String?): String? {
        val normalized = normalizePhoneNumber(phoneNumber) ?: return null

        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
        val projection = arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val selection = "REPLACE(${ContactsContract.CommonDataKinds.Phone.NUMBER}, '-', '') LIKE ? OR REPLACE(${ContactsContract.CommonDataKinds.Phone.NUMBER}, ' ', '') LIKE ? OR REPLACE(${ContactsContract.CommonDataKinds.Phone.NUMBER}, '(', '') LIKE ? OR REPLACE(${ContactsContract.CommonDataKinds.Phone.NUMBER}, ')', '') LIKE ?"
        val args = arrayOf("%$normalized%", "%$normalized%", "%$normalized%", "%$normalized%")

        var cursor: Cursor? = null
        try {
            cursor = context.contentResolver.query(uri, projection, selection, args, null)
            val name = cursor?.use {
                if (it.moveToFirst()) it.getString(it.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)) else null
            }
            Timber.tag("CRM_CALL_TRACKER").d("lookupContactName normalized=%s resolved=%s", normalized, name)
            return name
        } catch (e: Exception) {
            Timber.tag("CRM_CALL_TRACKER").e(e, "Unable to resolve contact for %s", normalized)
            return null
        } finally {
            cursor?.close()
        }
    }
}
