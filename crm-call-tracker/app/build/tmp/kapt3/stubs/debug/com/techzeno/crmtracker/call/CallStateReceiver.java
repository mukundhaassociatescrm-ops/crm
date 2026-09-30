package com.techzeno.crmtracker.call;

/**
 * BroadcastReceiver to detect phone call state changes. Uses TelephonyManager states.
 * Note: Modern Android may restrict implicit broadcasts; this receiver is registered
 * dynamically from the service or activity in real deployments.
 */
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u00004\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u000e\n\u0000\n\u0002\u0010\b\n\u0000\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0007\n\u0002\u0018\u0002\n\u0002\b\u0002\u0018\u0000 \u00152\u00020\u0001:\u0001\u0015B\u0005\u00a2\u0006\u0002\u0010\u0002J*\u0010\t\u001a\u00020\n2\u0006\u0010\u000b\u001a\u00020\f2\u0006\u0010\r\u001a\u00020\u00042\u0006\u0010\u000e\u001a\u00020\b2\b\u0010\u000f\u001a\u0004\u0018\u00010\u0006H\u0002J\u001a\u0010\u0010\u001a\u00020\n2\u0006\u0010\u000b\u001a\u00020\f2\b\u0010\u0011\u001a\u0004\u0018\u00010\u0006H\u0002J\u001c\u0010\u0012\u001a\u00020\n2\b\u0010\u000b\u001a\u0004\u0018\u00010\f2\b\u0010\u0013\u001a\u0004\u0018\u00010\u0014H\u0016R\u0010\u0010\u0003\u001a\u0004\u0018\u00010\u0004X\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u0010\u0010\u0005\u001a\u0004\u0018\u00010\u0006X\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0007\u001a\u00020\bX\u0082\u000e\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0016"}, d2 = {"Lcom/techzeno/crmtracker/call/CallStateReceiver;", "Landroid/content/BroadcastReceiver;", "()V", "eventHandler", "Lcom/techzeno/crmtracker/call/CallEventHandlerImpl;", "lastOutgoingNumber", "", "lastState", "", "handleStateChange", "", "context", "Landroid/content/Context;", "handler", "state", "number", "logOutgoingContactResolution", "rawOutgoingNumber", "onReceive", "intent", "Landroid/content/Intent;", "Companion", "app_debug"})
public final class CallStateReceiver extends android.content.BroadcastReceiver {
    @org.jetbrains.annotations.NotNull
    @java.lang.Deprecated
    public static final java.lang.String TAG = "CRM_CALL_TRACKER";
    private int lastState = android.telephony.TelephonyManager.CALL_STATE_IDLE;
    @org.jetbrains.annotations.Nullable
    private com.techzeno.crmtracker.call.CallEventHandlerImpl eventHandler;
    @org.jetbrains.annotations.Nullable
    private java.lang.String lastOutgoingNumber;
    @org.jetbrains.annotations.NotNull
    private static final com.techzeno.crmtracker.call.CallStateReceiver.Companion Companion = null;
    
    public CallStateReceiver() {
        super();
    }
    
    @java.lang.Override
    public void onReceive(@org.jetbrains.annotations.Nullable
    android.content.Context context, @org.jetbrains.annotations.Nullable
    android.content.Intent intent) {
    }
    
    private final void handleStateChange(android.content.Context context, com.techzeno.crmtracker.call.CallEventHandlerImpl handler, int state, java.lang.String number) {
    }
    
    private final void logOutgoingContactResolution(android.content.Context context, java.lang.String rawOutgoingNumber) {
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u0012\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\b\u0082\u0003\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002R\u000e\u0010\u0003\u001a\u00020\u0004X\u0086T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0005"}, d2 = {"Lcom/techzeno/crmtracker/call/CallStateReceiver$Companion;", "", "()V", "TAG", "", "app_debug"})
    static final class Companion {
        
        private Companion() {
            super();
        }
    }
}