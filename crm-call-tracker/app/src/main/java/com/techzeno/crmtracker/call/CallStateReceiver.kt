package com.techzeno.crmtracker.call

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.techzeno.crmtracker.ContactMatchHelper
import timber.log.Timber

/**
 * BroadcastReceiver to detect phone call state changes. Uses TelephonyManager states.
 * Note: Modern Android may restrict implicit broadcasts; this receiver is registered
 * dynamically from the service or activity in real deployments.
 */
class CallStateReceiver : BroadcastReceiver() {
    private companion object {
        const val TAG = "CRM_CALL_TRACKER"
    }

    private var lastState: Int = TelephonyManager.CALL_STATE_IDLE
    private var eventHandler: CallEventHandlerImpl? = null
    private var lastOutgoingNumber: String? = null

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) {
            Timber.tag(TAG).w("receiver triggered with null context or intent")
            return
        }

        val appContext = context.applicationContext
        val action = intent.action
        Timber.tag(TAG).d("receiver triggered; action=%s", action)

        if (Intent.ACTION_NEW_OUTGOING_CALL.equals(action)) {
            val rawOutgoingNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER)
            lastOutgoingNumber = rawOutgoingNumber
            Timber.tag(TAG).d("outgoing raw number received: %s", rawOutgoingNumber)
            logOutgoingContactResolution(appContext, rawOutgoingNumber)
            return
        }

        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(action)) {
            Timber.tag(TAG).d("ignoring non-phone-state broadcast; action=%s", action)
            return
        }

        val stateStr = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
        val incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
        val state = when (stateStr) {
            TelephonyManager.EXTRA_STATE_RINGING -> TelephonyManager.CALL_STATE_RINGING
            TelephonyManager.EXTRA_STATE_OFFHOOK -> TelephonyManager.CALL_STATE_OFFHOOK
            TelephonyManager.EXTRA_STATE_IDLE -> TelephonyManager.CALL_STATE_IDLE
            else -> TelephonyManager.CALL_STATE_IDLE
        }

        Timber.tag(TAG).d(
            "phone state received; state=%s stateStr=%s incomingNumber=%s",
            state,
            stateStr,
            incomingNumber
        )

        val handler = eventHandler ?: CallEventHandlerImpl(appContext).also { eventHandler = it }
        handleStateChange(appContext, handler, state, incomingNumber)
    }

    private fun handleStateChange(context: Context, handler: CallEventHandlerImpl, state: Int, number: String?) {
        when (state) {
            TelephonyManager.CALL_STATE_RINGING -> {
                Timber.tag(TAG).d("incoming call ringing; phoneNumber=%s", number)
                handler.onRinging(number)
            }
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                val outgoingNumber = lastOutgoingNumber ?: number
                Timber.tag(TAG).d("call offhook; currentState=%s lastState=%s outgoingNumber=%s", state, lastState, outgoingNumber)
                if (outgoingNumber != null) {
                    logOutgoingContactResolution(context, outgoingNumber)
                    handler.onOffhook(outgoingNumber)
                } else {
                    handler.onOffhook()
                }
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                Timber.tag(TAG).d("call state idle; ending active call and finalizing event")
                handler.onIdle()
                lastOutgoingNumber = null
            }
            else -> Timber.tag(TAG).d("unhandled call state=%s", state)
        }
        lastState = state
    }

    private fun logOutgoingContactResolution(context: Context, rawOutgoingNumber: String?) {
        val normalizedOutgoingNumber = ContactMatchHelper.normalizePhoneNumber(rawOutgoingNumber)
        val lookupNumber = normalizedOutgoingNumber ?: rawOutgoingNumber
        val contactName = if (lookupNumber != null) ContactMatchHelper.lookupContactName(context, lookupNumber) else null

        Timber.tag(TAG).d("outgoing raw number received: %s", rawOutgoingNumber)
        Timber.tag(TAG).d("outgoing normalized number: %s", normalizedOutgoingNumber)
        Timber.tag(TAG).d("outgoing number passed to contact lookup: %s", lookupNumber)
        Timber.tag(TAG).d("outgoing contact lookup result: %s", if (contactName != null) "FOUND" else "NOT_FOUND")
        Timber.tag(TAG).d("outgoing contact name: %s", contactName)
    }
}

/**
 * Handler interface to separate detection from persistence.
 */
interface CallEventHandler {
    fun onRinging(number: String?)
    fun onOffhook(number: String? = null)
    fun onIdle()
}
