package com.techzeno.crmtracker.ui;

@kotlin.Metadata(mv = {1, 9, 0}, k = 2, xi = 48, d1 = {"\u0000h\n\u0000\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0005\n\u0002\u0010 \n\u0000\n\u0002\u0010\u000b\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\u0004\n\u0002\u0010\u000e\n\u0002\b\u0006\n\u0002\u0010\b\n\u0002\b\f\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0018\u0002\n\u0002\b\n\n\u0002\u0010\t\n\u0002\b\u000b\u001a0\u0010\u0000\u001a\u00020\u00012\u0006\u0010\u0002\u001a\u00020\u00032\f\u0010\u0004\u001a\b\u0012\u0004\u0012\u00020\u00010\u00052\u0010\b\u0002\u0010\u0006\u001a\n\u0012\u0004\u0012\u00020\u0001\u0018\u00010\u0005H\u0007\u001a\u001e\u0010\u0007\u001a\u00020\u00012\u0006\u0010\u0002\u001a\u00020\u00032\f\u0010\b\u001a\b\u0012\u0004\u0012\u00020\u00010\u0005H\u0003\u001a2\u0010\t\u001a\u00020\u00012\f\u0010\n\u001a\b\u0012\u0004\u0012\u00020\u00030\u000b2\u0006\u0010\f\u001a\u00020\r2\u0012\u0010\u000e\u001a\u000e\u0012\u0004\u0012\u00020\u0003\u0012\u0004\u0012\u00020\u00010\u000fH\u0007\u001a2\u0010\u0010\u001a\u00020\u00012\u0006\u0010\u0011\u001a\u00020\u00122\f\u0010\u0013\u001a\b\u0012\u0004\u0012\u00020\u00010\u00052\u0012\u0010\u0014\u001a\u000e\u0012\u0004\u0012\u00020\u0012\u0012\u0004\u0012\u00020\u00010\u000fH\u0003\u001ap\u0010\u0015\u001a\u00020\u00012\u0006\u0010\u0016\u001a\u00020\u00172\u0006\u0010\u0018\u001a\u00020\u00172\u0006\u0010\u0019\u001a\u00020\u00172\f\u0010\u001a\u001a\b\u0012\u0004\u0012\u00020\u00030\u000b2\b\u0010\u001b\u001a\u0004\u0018\u00010\u00032\b\u0010\u001c\u001a\u0004\u0018\u00010\u00032\u0006\u0010\u001d\u001a\u00020\u001e2\u0006\u0010\u001f\u001a\u00020\u001e2\u0006\u0010 \u001a\u00020\u001e2\u0006\u0010!\u001a\u00020\u001e2\f\u0010\"\u001a\b\u0012\u0004\u0012\u00020\u00010\u0005H\u0003\u001a\u0018\u0010#\u001a\u00020\u00012\u0006\u0010$\u001a\u00020\u00172\u0006\u0010%\u001a\u00020\u0017H\u0003\u001a\u0018\u0010&\u001a\u00020\u00012\u0006\u0010\'\u001a\u00020\u00172\u0006\u0010(\u001a\u00020\u0017H\u0003\u001a\u0010\u0010)\u001a\u00020\u00012\u0006\u0010*\u001a\u00020+H\u0007\u001aD\u0010,\u001a\u00020\u00012\b\b\u0002\u0010-\u001a\u00020.2\u0006\u0010\'\u001a\u00020\u00172\u0006\u0010%\u001a\u00020\u00172\u0006\u0010/\u001a\u0002002\u0006\u00101\u001a\u0002002\u0006\u00102\u001a\u000203H\u0003\u00f8\u0001\u0000\u00a2\u0006\u0004\b4\u00105\u001a\u0010\u00106\u001a\u00020\u00012\u0006\u0010\u0002\u001a\u00020\u0003H\u0003\u001a\b\u00107\u001a\u00020\u0001H\u0007\u001a\u0010\u00108\u001a\u00020\u00012\u0006\u00109\u001a\u00020\u0012H\u0003\u001a$\u0010:\u001a\u00020\u00012\f\u0010;\u001a\b\u0012\u0004\u0012\u00020\u00120\u000b2\f\u0010\u0006\u001a\b\u0012\u0004\u0012\u00020\u00010\u0005H\u0007\u001a\u0010\u0010<\u001a\u00020\u00172\u0006\u0010=\u001a\u00020>H\u0002\u001a\u0010\u0010?\u001a\u00020\u00172\u0006\u0010=\u001a\u00020>H\u0002\u001a\u0010\u0010@\u001a\u00020\u00172\u0006\u0010A\u001a\u00020>H\u0002\u001a\u0010\u0010B\u001a\u00020\u00172\u0006\u0010=\u001a\u00020>H\u0002\u001a\u0010\u0010C\u001a\u00020\u00172\u0006\u0010=\u001a\u00020>H\u0002\u001a\u0010\u0010D\u001a\u00020\u00172\u0006\u0010E\u001a\u00020\u001eH\u0002\u001a\u0018\u0010F\u001a\u00020\r2\u0006\u0010G\u001a\u00020>2\u0006\u0010H\u001a\u00020>H\u0002\u0082\u0002\u0007\n\u0005\b\u00a1\u001e0\u0001\u00a8\u0006I"}, d2 = {"CallDetailsScreen", "", "call", "Lcom/techzeno/crmtracker/call/CallEvent;", "onBack", "Lkotlin/Function0;", "onCreateTask", "CallListItem", "onClick", "CallsScreen", "calls", "", "isLoading", "", "onCallClick", "Lkotlin/Function1;", "CreateTaskSheet", "initialValue", "Lcom/techzeno/crmtracker/ui/TaskDraft;", "onDismiss", "onSave", "DashboardContent", "serviceStatus", "", "permissionStatus", "lastSyncLabel", "recentCalls", "lastCall", "callEndedBanner", "incomingCalls", "", "outgoingCalls", "totalCalls", "followUpsPending", "onRefresh", "DetailItem", "label", "value", "EmptyStateCard", "title", "subtitle", "MainScreen", "vm", "Lcom/techzeno/crmtracker/ui/MainViewModel;", "MetricCard", "modifier", "Landroidx/compose/ui/Modifier;", "tint", "Landroidx/compose/ui/graphics/Color;", "tintSoft", "icon", "Landroidx/compose/ui/graphics/vector/ImageVector;", "MetricCard-BQnUqu0", "(Landroidx/compose/ui/Modifier;Ljava/lang/String;Ljava/lang/String;JJLandroidx/compose/ui/graphics/vector/ImageVector;)V", "RecentCallCard", "SettingsScreen", "TaskCard", "task", "TasksScreen", "tasks", "formatCallDate", "epochMs", "", "formatCallTime", "formatDuration", "durationMs", "formatFollowUpDate", "formatFollowUpTime", "formatRecording", "seconds", "isSameDay", "first", "second", "app_debug"})
public final class MainScreenKt {
    
    @androidx.compose.runtime.Composable
    public static final void MainScreen(@org.jetbrains.annotations.NotNull
    com.techzeno.crmtracker.ui.MainViewModel vm) {
    }
    
    @androidx.compose.runtime.Composable
    private static final void DashboardContent(java.lang.String serviceStatus, java.lang.String permissionStatus, java.lang.String lastSyncLabel, java.util.List<com.techzeno.crmtracker.call.CallEvent> recentCalls, com.techzeno.crmtracker.call.CallEvent lastCall, com.techzeno.crmtracker.call.CallEvent callEndedBanner, int incomingCalls, int outgoingCalls, int totalCalls, int followUpsPending, kotlin.jvm.functions.Function0<kotlin.Unit> onRefresh) {
    }
    
    @androidx.compose.runtime.Composable
    public static final void CallsScreen(@org.jetbrains.annotations.NotNull
    java.util.List<com.techzeno.crmtracker.call.CallEvent> calls, boolean isLoading, @org.jetbrains.annotations.NotNull
    kotlin.jvm.functions.Function1<? super com.techzeno.crmtracker.call.CallEvent, kotlin.Unit> onCallClick) {
    }
    
    @androidx.compose.runtime.Composable
    private static final void CallListItem(com.techzeno.crmtracker.call.CallEvent call, kotlin.jvm.functions.Function0<kotlin.Unit> onClick) {
    }
    
    @androidx.compose.runtime.Composable
    public static final void CallDetailsScreen(@org.jetbrains.annotations.NotNull
    com.techzeno.crmtracker.call.CallEvent call, @org.jetbrains.annotations.NotNull
    kotlin.jvm.functions.Function0<kotlin.Unit> onBack, @org.jetbrains.annotations.Nullable
    kotlin.jvm.functions.Function0<kotlin.Unit> onCreateTask) {
    }
    
    @androidx.compose.runtime.Composable
    public static final void SettingsScreen() {
    }
    
    @androidx.compose.runtime.Composable
    private static final void EmptyStateCard(java.lang.String title, java.lang.String subtitle) {
    }
    
    @androidx.compose.runtime.Composable
    private static final void RecentCallCard(com.techzeno.crmtracker.call.CallEvent call) {
    }
    
    @androidx.compose.runtime.Composable
    public static final void TasksScreen(@org.jetbrains.annotations.NotNull
    java.util.List<com.techzeno.crmtracker.ui.TaskDraft> tasks, @org.jetbrains.annotations.NotNull
    kotlin.jvm.functions.Function0<kotlin.Unit> onCreateTask) {
    }
    
    @androidx.compose.runtime.Composable
    private static final void TaskCard(com.techzeno.crmtracker.ui.TaskDraft task) {
    }
    
    @kotlin.OptIn(markerClass = {androidx.compose.material3.ExperimentalMaterial3Api.class})
    @androidx.compose.runtime.Composable
    private static final void CreateTaskSheet(com.techzeno.crmtracker.ui.TaskDraft initialValue, kotlin.jvm.functions.Function0<kotlin.Unit> onDismiss, kotlin.jvm.functions.Function1<? super com.techzeno.crmtracker.ui.TaskDraft, kotlin.Unit> onSave) {
    }
    
    @androidx.compose.runtime.Composable
    private static final void DetailItem(java.lang.String label, java.lang.String value) {
    }
    
    private static final java.lang.String formatCallDate(long epochMs) {
        return null;
    }
    
    private static final java.lang.String formatCallTime(long epochMs) {
        return null;
    }
    
    private static final java.lang.String formatDuration(long durationMs) {
        return null;
    }
    
    private static final java.lang.String formatFollowUpDate(long epochMs) {
        return null;
    }
    
    private static final java.lang.String formatFollowUpTime(long epochMs) {
        return null;
    }
    
    private static final java.lang.String formatRecording(int seconds) {
        return null;
    }
    
    private static final boolean isSameDay(long first, long second) {
        return false;
    }
}