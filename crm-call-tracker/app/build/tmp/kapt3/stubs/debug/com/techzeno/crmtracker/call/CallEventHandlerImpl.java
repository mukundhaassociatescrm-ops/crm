package com.techzeno.crmtracker.call;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u00004\n\u0002\u0018\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0002\b\u0003\u0018\u0000 \u00112\u00020\u0001:\u0001\u0011B\r\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0004J\b\u0010\u000b\u001a\u00020\fH\u0016J\u0012\u0010\r\u001a\u00020\f2\b\u0010\u000e\u001a\u0004\u0018\u00010\u000fH\u0016J\u0012\u0010\u0010\u001a\u00020\f2\b\u0010\u000e\u001a\u0004\u0018\u00010\u000fH\u0016R\u000e\u0010\u0002\u001a\u00020\u0003X\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u0010\u0010\u0005\u001a\u0004\u0018\u00010\u0006X\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0007\u001a\u00020\bX\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u000e\u0010\t\u001a\u00020\nX\u0082\u0004\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0012"}, d2 = {"Lcom/techzeno/crmtracker/call/CallEventHandlerImpl;", "Lcom/techzeno/crmtracker/call/CallEventHandler;", "context", "Landroid/content/Context;", "(Landroid/content/Context;)V", "currentEvent", "Lcom/techzeno/crmtracker/call/CallEvent;", "inCall", "Ljava/util/concurrent/atomic/AtomicBoolean;", "repo", "Lcom/techzeno/crmtracker/data/CallRepository;", "onIdle", "", "onOffhook", "number", "", "onRinging", "Companion", "app_debug"})
public final class CallEventHandlerImpl implements com.techzeno.crmtracker.call.CallEventHandler {
    @org.jetbrains.annotations.NotNull
    private final android.content.Context context = null;
    @org.jetbrains.annotations.NotNull
    @java.lang.Deprecated
    public static final java.lang.String TAG = "CRM_CALL_TRACKER";
    @org.jetbrains.annotations.NotNull
    private final com.techzeno.crmtracker.data.CallRepository repo = null;
    @org.jetbrains.annotations.Nullable
    private com.techzeno.crmtracker.call.CallEvent currentEvent;
    @org.jetbrains.annotations.NotNull
    private final java.util.concurrent.atomic.AtomicBoolean inCall = null;
    @org.jetbrains.annotations.NotNull
    private static final com.techzeno.crmtracker.call.CallEventHandlerImpl.Companion Companion = null;
    
    public CallEventHandlerImpl(@org.jetbrains.annotations.NotNull
    android.content.Context context) {
        super();
    }
    
    @java.lang.Override
    public void onRinging(@org.jetbrains.annotations.Nullable
    java.lang.String number) {
    }
    
    @java.lang.Override
    public void onOffhook(@org.jetbrains.annotations.Nullable
    java.lang.String number) {
    }
    
    @java.lang.Override
    public void onIdle() {
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u0012\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0000\b\u0082\u0003\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002R\u000e\u0010\u0003\u001a\u00020\u0004X\u0086T\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0005"}, d2 = {"Lcom/techzeno/crmtracker/call/CallEventHandlerImpl$Companion;", "", "()V", "TAG", "", "app_debug"})
    static final class Companion {
        
        private Companion() {
            super();
        }
    }
}