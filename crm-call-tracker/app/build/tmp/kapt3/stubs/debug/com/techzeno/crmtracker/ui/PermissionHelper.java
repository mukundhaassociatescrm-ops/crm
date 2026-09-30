package com.techzeno.crmtracker.ui;

@kotlin.Metadata(mv = {1, 9, 0}, k = 1, xi = 48, d1 = {"\u00004\n\u0002\u0018\u0002\n\u0002\u0010\u0000\n\u0000\n\u0002\u0018\u0002\n\u0002\b\u0002\n\u0002\u0010\u000b\n\u0002\b\b\n\u0002\u0018\u0002\n\u0002\u0010\u0002\n\u0000\n\u0002\u0018\u0002\n\u0002\u0010\u0011\n\u0002\u0010\u000e\n\u0002\b\u0007\u0018\u00002\u00020\u0001B\r\u0012\u0006\u0010\u0002\u001a\u00020\u0003\u00a2\u0006\u0002\u0010\u0004J\u0006\u0010\u0017\u001a\u00020\u0006J\u0006\u0010\u0018\u001a\u00020\u0010J\u001a\u0010\u0019\u001a\u00020\u00102\u0012\u0010\u001a\u001a\u000e\u0012\u0004\u0012\u00020\u0006\u0012\u0004\u0012\u00020\u00100\u000fR\u000e\u0010\u0002\u001a\u00020\u0003X\u0082\u0004\u00a2\u0006\u0002\n\u0000R+\u0010\u0007\u001a\u00020\u00062\u0006\u0010\u0005\u001a\u00020\u00068F@BX\u0086\u008e\u0002\u00a2\u0006\u0012\n\u0004\b\f\u0010\r\u001a\u0004\b\b\u0010\t\"\u0004\b\n\u0010\u000bR\u001c\u0010\u000e\u001a\u0010\u0012\u0004\u0012\u00020\u0006\u0012\u0004\u0012\u00020\u0010\u0018\u00010\u000fX\u0082\u000e\u00a2\u0006\u0002\n\u0000R\u001a\u0010\u0011\u001a\u000e\u0012\n\u0012\b\u0012\u0004\u0012\u00020\u00140\u00130\u0012X\u0082\u0004\u00a2\u0006\u0002\n\u0000R\u0016\u0010\u0015\u001a\b\u0012\u0004\u0012\u00020\u00140\u0013X\u0082\u0004\u00a2\u0006\u0004\n\u0002\u0010\u0016\u00a8\u0006\u001b"}, d2 = {"Lcom/techzeno/crmtracker/ui/PermissionHelper;", "", "activity", "Landroidx/activity/ComponentActivity;", "(Landroidx/activity/ComponentActivity;)V", "<set-?>", "", "hasPhonePermissions", "getHasPhonePermissions", "()Z", "setHasPhonePermissions", "(Z)V", "hasPhonePermissions$delegate", "Landroidx/compose/runtime/MutableState;", "permissionListener", "Lkotlin/Function1;", "", "request", "Landroidx/activity/result/ActivityResultLauncher;", "", "", "requiredPermissions", "[Ljava/lang/String;", "isPermissionGranted", "requestPhonePermissions", "setPermissionListener", "listener", "app_debug"})
public final class PermissionHelper {
    @org.jetbrains.annotations.NotNull
    private final androidx.activity.ComponentActivity activity = null;
    @org.jetbrains.annotations.NotNull
    private final java.lang.String[] requiredPermissions = {"android.permission.READ_PHONE_STATE", "android.permission.READ_CALL_LOG", "android.permission.READ_PHONE_NUMBERS", "android.permission.READ_CONTACTS"};
    @org.jetbrains.annotations.NotNull
    private final androidx.compose.runtime.MutableState hasPhonePermissions$delegate = null;
    @org.jetbrains.annotations.Nullable
    private kotlin.jvm.functions.Function1<? super java.lang.Boolean, kotlin.Unit> permissionListener;
    @org.jetbrains.annotations.NotNull
    private final androidx.activity.result.ActivityResultLauncher<java.lang.String[]> request = null;
    
    public PermissionHelper(@org.jetbrains.annotations.NotNull
    androidx.activity.ComponentActivity activity) {
        super();
    }
    
    public final boolean getHasPhonePermissions() {
        return false;
    }
    
    private final void setHasPhonePermissions(boolean p0) {
    }
    
    public final void setPermissionListener(@org.jetbrains.annotations.NotNull
    kotlin.jvm.functions.Function1<? super java.lang.Boolean, kotlin.Unit> listener) {
    }
    
    public final void requestPhonePermissions() {
    }
    
    public final boolean isPermissionGranted() {
        return false;
    }
}