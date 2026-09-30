package com.techzeno.crmtracker.data;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u0000&\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0010 \n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0003\n\u0002\u0010\t\n\u0002\b\u0003\bg\u0018\u00002\u00020\u0001J\u0014\u0010\u0002\u001a\b\u0012\u0004\u0012\u00020\u00040\u0003H\u00a7@\u00a2\u0006\u0002\u0010\u0005J\u0014\u0010\u0006\u001a\u000e\u0012\n\u0012\b\u0012\u0004\u0012\u00020\u00040\u00030\u0007H\'J\u0010\u0010\b\u001a\u0004\u0018\u00010\u0004H\u00a7@\u00a2\u0006\u0002\u0010\u0005J\u0010\u0010\t\u001a\n\u0012\u0006\u0012\u0004\u0018\u00010\u00040\u0007H\'J\u0016\u0010\n\u001a\u00020\u000b2\u0006\u0010\f\u001a\u00020\u0004H\u00a7@\u00a2\u0006\u0002\u0010\r\u00a8\u0006\u000e"}, d2 = {"Lcom/techzeno/crmtracker/data/CallDao;", "", "getAll", "", "Lcom/techzeno/crmtracker/call/CallEvent;", "(Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "getAllFlow", "Lkotlinx/coroutines/flow/Flow;", "getLatest", "getLatestFlow", "insert", "", "call", "(Lcom/techzeno/crmtracker/call/CallEvent;Lkotlin/coroutines/Continuation;)Ljava/lang/Object;", "app_debug"})
@androidx.room.Dao
public abstract interface CallDao {
    
    @androidx.room.Insert(onConflict = 5)
    @org.jetbrains.annotations.Nullable
    public abstract java.lang.Object insert(@org.jetbrains.annotations.NotNull
    com.techzeno.crmtracker.call.CallEvent call, @org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super java.lang.Long> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM call_events ORDER BY startTime DESC")
    @org.jetbrains.annotations.NotNull
    public abstract kotlinx.coroutines.flow.Flow<java.util.List<com.techzeno.crmtracker.call.CallEvent>> getAllFlow();
    
    @androidx.room.Query(value = "SELECT * FROM call_events ORDER BY startTime DESC")
    @org.jetbrains.annotations.Nullable
    public abstract java.lang.Object getAll(@org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super java.util.List<com.techzeno.crmtracker.call.CallEvent>> $completion);
    
    @androidx.room.Query(value = "SELECT * FROM call_events ORDER BY startTime DESC LIMIT 1")
    @org.jetbrains.annotations.NotNull
    public abstract kotlinx.coroutines.flow.Flow<com.techzeno.crmtracker.call.CallEvent> getLatestFlow();
    
    @androidx.room.Query(value = "SELECT * FROM call_events ORDER BY startTime DESC LIMIT 1")
    @org.jetbrains.annotations.Nullable
    public abstract java.lang.Object getLatest(@org.jetbrains.annotations.NotNull
    kotlin.coroutines.Continuation<? super com.techzeno.crmtracker.call.CallEvent> $completion);
}