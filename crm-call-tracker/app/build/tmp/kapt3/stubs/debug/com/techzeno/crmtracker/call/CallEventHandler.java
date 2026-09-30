package com.techzeno.crmtracker.call;

/**
 * Handler interface to separate detection from persistence.
 */
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u001a\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010\u0002\n\u0002\b\u0002\n\u0002\u0010\u000e\n\u0002\b\u0002\bf\u0018\u00002\u00020\u0001J\b\u0010\u0002\u001a\u00020\u0003H&J\u0014\u0010\u0004\u001a\u00020\u00032\n\b\u0002\u0010\u0005\u001a\u0004\u0018\u00010\u0006H&J\u0012\u0010\u0007\u001a\u00020\u00032\b\u0010\u0005\u001a\u0004\u0018\u00010\u0006H&\u00a8\u0006\b"}, d2 = {"Lcom/techzeno/crmtracker/call/CallEventHandler;", "", "onIdle", "", "onOffhook", "number", "", "onRinging", "app_debug"})
public abstract interface CallEventHandler {
    
    public abstract void onRinging(@org.jetbrains.annotations.Nullable
    java.lang.String number);
    
    public abstract void onOffhook(@org.jetbrains.annotations.Nullable
    java.lang.String number);
    
    public abstract void onIdle();
    
    /**
     * Handler interface to separate detection from persistence.
     */
    @kotlin.Metadata(mv = {1, 9, 0}, k = 3, xi = 48)
    public static final class DefaultImpls {
    }
}