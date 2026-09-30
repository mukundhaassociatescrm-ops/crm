package com.techzeno.crmtracker.data;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u00004\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0010 \n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0003\n\u0002\u0010\t\n\u0002\b\u0004\u0018\u0000 \u00132\u00020\u0001:\u0001\u0013B\u000f\b\u0002\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0004J\u0014\u0010\u0007\u001a\b\u0012\u0004\u0012\u00020\t0\bH\u0086@\u00a2\u0006\u0002\u0010\nJ\u0012\u0010\u000b\u001a\u000e\u0012\n\u0012\b\u0012\u0004\u0012\u00020\t0\b0\fJ\u0010\u0010\r\u001a\u0004\u0018\u00010\tH\u0086@\u00a2\u0006\u0002\u0010\nJ\u000e\u0010\u000e\u001a\n\u0012\u0006\u0012\u0004\u0018\u00010\t0\fJ\u0016\u0010\u000f\u001a\u00020\u00102\u0006\u0010\u0011\u001a\u00020\tH\u0086@\u00a2\u0006\u0002\u0010\u0012R\u000e\u0010\u0005\u001a\u00020\u0006X\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u000e\u0010\u0002\u001a\u00020\u0003X\u0082\u0004\u00a2\u0006\u0002\n\u0000\u00a8\u0006\u0014"}, d2 = {"Lcom/techzeno/crmtracker/data/CallRepository;", "", "db", "Lcom/techzeno/crmtracker/data/CallDatabase;", "(Lcom/techzeno/crmtracker/data/CallDatabase;)V", "dao", "Lcom/techzeno/crmtracker/data/CallDao;", "getAllCalls", "", "Lcom/techzeno/crmtracker/call/CallEvent;", "(Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "getAllCallsFlow", "Lkotlinx/coroutines/flow/Flow;", "getLatestCall", "getLatestCallFlow", "insert", "", "call", "(Lcom/techzeno/crmtracker/call/CallEvent;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "Companion", "app_debug"})
public final class CallRepository {
    @org.jetbrains.annotations.NotNull
    private final com.techzeno.crmtracker.data.CallDatabase db = null;
    @org.jetbrains.annotations.NotNull
    private final com.techzeno.crmtracker.data.CallDao dao = null;
    @kotlin.jvm.Volatile
    @org.jetbrains.annotations.Nullable
    private static volatile com.techzeno.crmtracker.data.CallRepository INSTANCE;
    @org.jetbrains.annotations.NotNull
    public static final com.techzeno.crmtracker.data.CallRepository.Companion Companion = null;
    
    private CallRepository(com.techzeno.crmtracker.data.CallDatabase db) {
        super();
    }
    
    @org.jetbrains.annotations.Nullable
    public final java.lang.Object insert(@org.jetbrains.annotations.NotNull
    com.techzeno.crmtracker.call.CallEvent call, @org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super java.lang.Long> $completion) {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull
    public final kotlinx.coroutines.flow.Flow<java.util.List<com.techzeno.crmtracker.call.CallEvent>> getAllCallsFlow() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable
    public final java.lang.Object getAllCalls(@org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super java.util.List<com.techzeno.crmtracker.call.CallEvent>> $completion) {
        return null;
    }
    
    @org.jetbrains.annotations.NotNull
    public final kotlinx.coroutines.flow.Flow<com.techzeno.crmtracker.call.CallEvent> getLatestCallFlow() {
        return null;
    }
    
    @org.jetbrains.annotations.Nullable
    public final java.lang.Object getLatestCall(@org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super com.techzeno.crmtracker.call.CallEvent> $completion) {
        return null;
    }
    
    @kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000 \n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\b\u0086\u0003\u0018\u00002\u00020\u0001B\u0007\b\u0002\u00a2\u0006\u0002\u0010\u0002J\u0006\u0010\u0005\u001a\u00020\u0004J\u000e\u0010\u0006\u001a\u00020\u00072\u0006\u0010\b\u001a\u00020\tR\u0010\u0010\u0003\u001a\u0004\u0018\u00010\u0004X\u0082\u000e\u00a2\u0006\u0002\n\u0000\u00a8\u0006\n"}, d2 = {"Lcom/techzeno/crmtracker/data/CallRepository$Companion;", "", "()V", "INSTANCE", "Lcom/techzeno/crmtracker/data/CallRepository;", "getInstance", "init", "", "context", "Landroid/content/Context;", "app_debug"})
    public static final class Companion {
        
        private Companion() {
            super();
        }
        
        public final void init(@org.jetbrains.annotations.NotNull
        android.content.Context context) {
        }
        
        @org.jetbrains.annotations.NotNull
        public final com.techzeno.crmtracker.data.CallRepository getInstance() {
            return null;
        }
    }
}