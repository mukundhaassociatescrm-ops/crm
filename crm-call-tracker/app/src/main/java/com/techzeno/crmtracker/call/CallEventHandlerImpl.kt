package com.techzeno.crmtracker.call

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import timber.log.Timber
import com.techzeno.crmtracker.data.CallRepository
import java.util.concurrent.atomic.AtomicBoolean

class CallEventHandlerImpl(private val context: Context) : CallEventHandler {
    private companion object {
        const val TAG = "CRM_CALL_TRACKER"
    }

    private val repo = CallRepository.getInstance()

    private var currentEvent: CallEvent? = null
    private val inCall = AtomicBoolean(false)

    override fun onRinging(number: String?) {
        Timber.tag(TAG).d("CallEventHandlerImpl.onRinging; phoneNumber=%s", number)
        currentEvent = CallEvent(
            phoneNumber = number,
            callType = CallType.INCOMING,
            startTime = System.currentTimeMillis(),
            status = CallStatus.RINGING
        )
        Timber.tag(TAG).d("incoming call created; currentEvent=%s", currentEvent)
    }

    override fun onOffhook(number: String?) {
        Timber.tag(TAG).d("CallEventHandlerImpl.onOffhook; currentEvent=%s outgoingNumber=%s", currentEvent, number)
        if (currentEvent == null) {
            currentEvent = CallEvent(
                phoneNumber = number,
                callType = CallType.OUTGOING,
                startTime = System.currentTimeMillis(),
                status = CallStatus.ANSWERED
            )
            Timber.tag(TAG).d("outgoing call created with number=%s; currentEvent=%s", number, currentEvent)
        } else {
            currentEvent = currentEvent?.copy(
                phoneNumber = currentEvent?.phoneNumber ?: number,
                status = CallStatus.ANSWERED,
                startTime = currentEvent?.startTime ?: System.currentTimeMillis()
            )
            Timber.tag(TAG).d("incoming call answered; currentEvent=%s", currentEvent)
        }
        inCall.set(true)
    }

    override fun onIdle() {
        Timber.tag(TAG).d("CallEventHandlerImpl.onIdle; currentEvent=%s", currentEvent)
        val event = currentEvent ?: run {
            Timber.tag(TAG).d("no current event available; idle ignored")
            return
        }
        val end = System.currentTimeMillis()
        val duration = if (event.startTime > 0) end - event.startTime else 0L
        val finalized = event.copy(
            endTime = end,
            duration = duration,
            status = if (inCall.get()) CallStatus.ENDED else CallStatus.MISSED
        )

        Timber.tag(TAG).d("CallEvent finalized; event=%s duration=%d", finalized, duration)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val id = repo.insert(finalized)
                Timber.tag(TAG).d("database insert attempted; event=%s", finalized)
                Timber.tag(TAG).d("database insert successful; rowId=%s event=%s", id, finalized)
            } catch (ex: Exception) {
                Timber.tag(TAG).e(ex, "database insert failed; event=%s", finalized)
            }
        }

        currentEvent = null
        inCall.set(false)
    }
}
