package com.techzeno.crmtracker.data;

/**
 * Interface stub for future CRM sync integration. Do not implement network calls yet.
 */
@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000\u0018\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\bf\u0018\u00002\u00020\u0001J\u0016\u0010\u0002\u001a\u00020\u00032\u0006\u0010\u0004\u001a\u00020\u0005H\u00a6@\u00a2\u0006\u0002\u0010\u0006\u00a8\u0006\u0007"}, d2 = {"Lcom/techzeno/crmtracker/data/CallSyncRepository;", "", "sync", "", "event", "Lcom/techzeno/crmtracker/call/CallEvent;", "(Lcom/techzeno/crmtracker/call/CallEvent;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "app_debug"})
public abstract interface CallSyncRepository {
    
    @org.jetbrains.annotations.Nullable
    public abstract java.lang.Object sync(@org.jetbrains.annotations.NotNull
    com.techzeno.crmtracker.call.CallEvent event, @org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super kotlin.Unit> $completion);
}