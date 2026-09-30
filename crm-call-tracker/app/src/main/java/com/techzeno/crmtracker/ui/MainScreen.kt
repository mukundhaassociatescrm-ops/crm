package com.techzeno.crmtracker.ui

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
// note: keep only icons available in the project's icon set
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.IconButton
import androidx.compose.foundation.clickable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.core.content.ContextCompat
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.techzeno.crmtracker.ContactMatchHelper
import com.techzeno.crmtracker.R
import com.techzeno.crmtracker.call.CallEvent
import com.techzeno.crmtracker.call.CallType
import com.techzeno.crmtracker.ui.theme.AccentCoral
import com.techzeno.crmtracker.ui.theme.BackgroundSoft
import com.techzeno.crmtracker.ui.theme.BrandBlue
import com.techzeno.crmtracker.ui.theme.BrandBlueSoft
import com.techzeno.crmtracker.ui.theme.CardSurface
import com.techzeno.crmtracker.ui.theme.SuccessGreen
import com.techzeno.crmtracker.ui.theme.SuccessGreenSoft
import com.techzeno.crmtracker.ui.theme.TextPrimary
import com.techzeno.crmtracker.ui.theme.TextSecondary
import com.techzeno.crmtracker.ui.theme.WarningAmber
import com.techzeno.crmtracker.ui.theme.WarningAmberSoft
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun MainScreen(vm: MainViewModel) {
    val serviceStatus = vm.serviceStatus.collectAsState()
    val permissionStatus = vm.permissionStatus.collectAsState()
    val lastCall = vm.lastCall.collectAsState()
    val recentCalls = vm.recentCalls.collectAsState()
    val isLoading = vm.isLoading.collectAsState()
    var selectedTab by remember { mutableStateOf(0) }
    var selectedCall by remember { mutableStateOf<CallEvent?>(null) }
    var showCreateTaskSheet by remember { mutableStateOf(false) }
    var draftTask by remember { mutableStateOf<TaskDraft?>(null) }
    var callEndedBanner by remember { mutableStateOf<CallEvent?>(null) }
    val tasks = remember { mutableStateListOf<TaskDraft>() }
    val context = LocalContext.current
    val activity = context as? Activity

    LaunchedEffect(lastCall.value?.id, lastCall.value?.status) {
        val endedCall = lastCall.value
        if (endedCall?.status == com.techzeno.crmtracker.call.CallStatus.ENDED) {
            callEndedBanner = endedCall
            kotlinx.coroutines.delay(3000)
            if (callEndedBanner?.id == endedCall.id) {
                callEndedBanner = null
            }
        } else {
            callEndedBanner = null
        }
    }

    BackHandler {
        when {
            showCreateTaskSheet -> {
                showCreateTaskSheet = false
                draftTask = null
            }
            selectedCall != null -> {
                selectedCall = null
            }
            selectedTab != 0 -> {
                selectedTab = 0
            }
            else -> {
                (context as? ComponentActivity)?.onBackPressedDispatcher?.onBackPressed()
                activity?.finish()
            }
        }
    }

    val allCalls = recentCalls.value
    val incomingCalls = allCalls.count { it.callType == CallType.INCOMING }
    val outgoingCalls = allCalls.count { it.callType == CallType.OUTGOING }
    val totalCalls = allCalls.size
    val followUpsPending = 0
    val lastSyncLabel = lastCall.value?.let {
        "Updated ${formatCallTime(it.startTime)}"
    } ?: "Waiting for first detected call"
    val selectedContactName = selectedCall?.let {
        ContactMatchHelper.lookupContactName(LocalContext.current, it.phoneNumber)
    }

    if (selectedCall != null) {
        CallDetailsScreen(
            call = selectedCall!!,
            onBack = { selectedCall = null },
            onCreateTask = {
                showCreateTaskSheet = true
                draftTask = TaskDraft(
                    customerName = selectedContactName ?: "Unknown Contact",
                    customerPhone = selectedCall!!.phoneNumber ?: "Unknown number",
                    date = Date().time,
                    title = "",
                    description = "",
                    assignTo = "",
                    voiceNotePath = null,
                    voiceNoteDurationSeconds = 0,
                    attachments = emptyList()
                )
            }
        )

        if (showCreateTaskSheet && draftTask != null) {
            CreateTaskSheet(
                initialValue = draftTask!!,
                onDismiss = {
                    showCreateTaskSheet = false
                    draftTask = null
                },
                onSave = { created ->
                    tasks.add(created)
                    showCreateTaskSheet = false
                    draftTask = null
                }
            )
        }
        return
    }

    Scaffold(
        containerColor = BackgroundSoft,
        bottomBar = {
            NavigationBar(containerColor = CardSurface) {
                listOf("Dashboard", "Calls", "Tasks", "Settings").forEachIndexed { index, label ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = {
                            selectedTab = index
                            selectedCall = null
                            if (label == "Tasks") {
                                showCreateTaskSheet = false
                                draftTask = TaskDraft(
                                    customerName = "",
                                    customerPhone = "",
                                    date = Date().time,
                                    title = "",
                                    description = "",
                                    assignTo = "",
                                    voiceNotePath = null,
                                    voiceNoteDurationSeconds = 0,
                                    attachments = emptyList()
                                )
                            }
                        },
                        icon = {
                            val icon = when (label) {
                                "Dashboard" -> Icons.Outlined.Info
                                "Calls" -> Icons.Outlined.Call
                                "Tasks" -> Icons.Outlined.CheckCircle
                                else -> Icons.Outlined.Settings
                            }
                            Icon(icon, contentDescription = label)
                        },
                        label = { Text(label) }
                    )
                }
            }
        }
    ) { paddingValues ->
        when (selectedTab) {
            1 -> CallsScreen(
                calls = recentCalls.value,
                isLoading = isLoading.value,
                onCallClick = { selectedCall = it }
            )
            2 -> TasksScreen(
                tasks = tasks,
                onCreateTask = {
                    showCreateTaskSheet = true
                    draftTask = TaskDraft(
                        customerName = "",
                        customerPhone = "",
                        date = Date().time,
                        title = "",
                        description = "",
                        assignTo = "",
                        voiceNotePath = null,
                        voiceNoteDurationSeconds = 0,
                        attachments = emptyList()
                    )
                }
            )
            3 -> SettingsScreen()
            else -> DashboardContent(
                serviceStatus = serviceStatus.value,
                permissionStatus = permissionStatus.value,
                lastSyncLabel = lastSyncLabel,
                recentCalls = recentCalls.value,
                lastCall = lastCall.value,
                callEndedBanner = callEndedBanner,
                incomingCalls = incomingCalls,
                outgoingCalls = outgoingCalls,
                totalCalls = totalCalls,
                followUpsPending = followUpsPending,
                onRefresh = { vm.refreshStatus() }
            )
        }
    }
}

@Composable
private fun DashboardContent(
    serviceStatus: String,
    permissionStatus: String,
    lastSyncLabel: String,
    recentCalls: List<CallEvent>,
    lastCall: CallEvent?,
    callEndedBanner: CallEvent?,
    incomingCalls: Int,
    outgoingCalls: Int,
    totalCalls: Int,
    followUpsPending: Int,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Image(
                painter = painterResource(id = R.drawable.ma_logo),
                contentDescription = "Mukundha Associates logo",
                modifier = Modifier.size(width = 72.dp, height = 62.dp)
            )

            Column {
                Text(
                    text = "Mukundha Associates",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = "CRM Call Tracker",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = BrandBlue
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(SuccessGreen),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Tracking status",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = TextPrimary
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(50.dp),
                        color = SuccessGreenSoft,
                        tonalElevation = 0.dp
                    ) {
                        Text(
                            text = serviceStatus,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            color = SuccessGreen,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Permission status",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                    Text(
                        text = permissionStatus,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimary
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Last sync",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                    Text(
                        text = lastSyncLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Button(
                    onClick = onRefresh,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Refresh Status")
                }
            }
        }

        if (callEndedBanner != null) {
            val endedContext = LocalContext.current
            val endedContactName = remember(callEndedBanner.phoneNumber) {
                ContactMatchHelper.lookupContactName(endedContext, callEndedBanner.phoneNumber)
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = WarningAmberSoft),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "Call Ended",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = endedContactName ?: callEndedBanner.phoneNumber ?: "Unknown number",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextPrimary
                    )
                    Text(
                        text = callEndedBanner.phoneNumber ?: "Unknown number",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                    Text(
                        text = "Duration: ${formatDuration(callEndedBanner.duration)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextPrimary
                    )
                }
            }
        }

        Text(
            text = "Today's Activity",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Incoming Calls",
                value = incomingCalls.toString(),
                tint = SuccessGreen,
                tintSoft = SuccessGreenSoft,
                icon = Icons.Outlined.Call
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Outgoing Calls",
                value = outgoingCalls.toString(),
                tint = BrandBlue,
                tintSoft = BrandBlueSoft,
                icon = Icons.Outlined.Phone
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Total Calls",
                value = totalCalls.toString(),
                tint = AccentCoral,
                tintSoft = WarningAmberSoft,
                icon = Icons.Outlined.Info
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Follow-ups Pending",
                value = followUpsPending.toString(),
                tint = WarningAmber,
                tintSoft = WarningAmberSoft,
                icon = Icons.Outlined.CheckCircle
            )
        }

        Text(
            text = "Latest Call",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary
        )

        if (lastCall == null) {
            EmptyStateCard(
                title = "No calls detected yet",
                subtitle = "Detected calls will appear here automatically."
            )
        } else {
            val context = LocalContext.current
            var contactName by remember(lastCall.phoneNumber) { mutableStateOf<String?>(null) }

            LaunchedEffect(lastCall.phoneNumber) {
                contactName = ContactMatchHelper.lookupContactName(context, lastCall.phoneNumber)
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = CardSurface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = contactName ?: lastCall.phoneNumber ?: "Unknown number",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimary
                            )
                            Text(
                                text = lastCall.phoneNumber?.let { if (contactName != null) it else "Unknown number" } ?: "Unknown number",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary
                            )
                            Text(
                                text = lastCall.callType.name.lowercase().replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.bodyMedium,
                                color = TextSecondary
                            )
                        }

                        Surface(
                            shape = RoundedCornerShape(50.dp),
                            color = if (lastCall.callType == CallType.INCOMING) SuccessGreenSoft else BrandBlueSoft,
                            tonalElevation = 0.dp
                        ) {
                            Text(
                                text = if (lastCall.callType == CallType.INCOMING) "Inbound" else "Outbound",
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelLarge,
                                color = if (lastCall.callType == CallType.INCOMING) SuccessGreen else BrandBlue,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        DetailItem(label = "Time", value = formatCallTime(lastCall.startTime))
                        DetailItem(label = "Duration", value = formatDuration(lastCall.duration))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        DetailItem(label = "Status", value = lastCall.status.name.lowercase().replaceFirstChar { it.uppercase() })
                        DetailItem(label = "Customer match", value = contactName ?: "Not available")
                    }
                }
            }
        }

        Text(
            text = "Recent Calls",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary
        )

        if (recentCalls.isEmpty()) {
            EmptyStateCard(
                title = "No calls detected yet",
                subtitle = "Detected calls will appear here automatically."
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                recentCalls.take(6).forEach { call ->
                    RecentCallCard(call)
                }
            }
        }
    }
}

@Composable
fun CallsScreen(
    calls: List<CallEvent>,
    isLoading: Boolean,
    onCallClick: (CallEvent) -> Unit
) {
    val context = LocalContext.current
    var searchQuery by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("All") }

    val filteredCalls = remember(calls, searchQuery, selectedFilter) {
        calls.filter { call ->
            val contactName = ContactMatchHelper.lookupContactName(context, call.phoneNumber)
            val matchesText = searchQuery.isBlank() ||
                (contactName ?: call.phoneNumber ?: "").contains(searchQuery, ignoreCase = true) ||
                (call.phoneNumber ?: "").contains(searchQuery, ignoreCase = true)

            val matchesFilter = when (selectedFilter) {
                "Incoming" -> call.callType == CallType.INCOMING
                "Outgoing" -> call.callType == CallType.OUTGOING
                "Missed" -> call.status == com.techzeno.crmtracker.call.CallStatus.MISSED
                else -> true
            }

            matchesText && matchesFilter
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Image(
                painter = painterResource(id = R.drawable.ma_logo),
                contentDescription = "Mukundha Associates logo",
                modifier = Modifier.size(width = 72.dp, height = 62.dp)
            )

            Column {
                Text(
                    text = "Mukundha Associates",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = "CRM Call Tracker",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = BrandBlue
                )
            }
        }

        Text(
            text = "Calls",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search by contact name or phone number") },
            singleLine = true
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("All", "Incoming", "Outgoing", "Missed").forEach { filter ->
                val selected = selectedFilter == filter
                val fillColor = if (selected) BrandBlue else CardSurface
                val textColor = if (selected) Color.White else TextPrimary

                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    color = fillColor,
                    tonalElevation = if (selected) 0.dp else 0.dp
                ) {
                    Button(
                        onClick = { selectedFilter = filter },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = fillColor),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = filter,
                            style = MaterialTheme.typography.labelLarge,
                            color = textColor,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
                        )
                    }
                }
            }
        }

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = BrandBlue)
            }
        } else if (filteredCalls.isEmpty()) {
            EmptyStateCard(
                title = "No calls yet",
                subtitle = "Detected calls will appear here automatically."
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                filteredCalls.forEach { call ->
                    CallListItem(
                        call = call,
                        onClick = { onCallClick(call) }
                    )
                }
            }
        }
    }
}

@Composable
private fun CallListItem(
    call: CallEvent,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    val resolvedName = remember(call.phoneNumber) { ContactMatchHelper.lookupContactName(context, call.phoneNumber) }
    val displayName = resolvedName ?: "Unknown Contact"
    val phoneLabel = call.phoneNumber ?: "Unknown number"
    val dateLabel = formatCallDate(call.startTime)
    val typeLabel = when (call.callType) {
        CallType.INCOMING -> "Incoming"
        CallType.OUTGOING -> "Outgoing"
        CallType.UNKNOWN -> "Unknown"
    }
    val badgeColor = when (call.callType) {
        CallType.INCOMING -> SuccessGreenSoft
        CallType.OUTGOING -> BrandBlueSoft
        CallType.UNKNOWN -> WarningAmberSoft
    }
    val badgeTextColor = when (call.callType) {
        CallType.INCOMING -> SuccessGreen
        CallType.OUTGOING -> BrandBlue
        CallType.UNKNOWN -> WarningAmber
    }
    val callIcon = when (call.callType) {
        CallType.INCOMING -> Icons.Outlined.Call
        CallType.OUTGOING -> Icons.Outlined.Phone
        CallType.UNKNOWN -> Icons.Outlined.Call
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Button(
            onClick = onClick,
            colors = ButtonDefaults.buttonColors(containerColor = CardSurface),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = CircleShape,
                    color = badgeColor,
                    modifier = Modifier.size(44.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = callIcon,
                            contentDescription = null,
                            tint = badgeTextColor
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = displayName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = phoneLabel,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                    Text(
                        text = typeLabel,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                    Text(
                        text = "$dateLabel · ${formatCallTime(call.startTime)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                    Text(
                        text = "Duration · ${formatDuration(call.duration)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextPrimary,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
fun CallDetailsScreen(
    call: CallEvent,
    onBack: () -> Unit,
    onCreateTask: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val contactName = remember(call.phoneNumber) { ContactMatchHelper.lookupContactName(context, call.phoneNumber) } ?: "Unknown Contact"
    val phoneLabel = call.phoneNumber ?: "Unknown number"
    val typeLabel = when (call.callType) {
        CallType.INCOMING -> "Incoming"
        CallType.OUTGOING -> "Outgoing"
        CallType.UNKNOWN -> "Unknown"
    }
    val statusLabel = when (call.status) {
        com.techzeno.crmtracker.call.CallStatus.MISSED -> "Missed"
        com.techzeno.crmtracker.call.CallStatus.ENDED -> "Ended"
        com.techzeno.crmtracker.call.CallStatus.ANSWERED -> "Answered"
        com.techzeno.crmtracker.call.CallStatus.RINGING -> "Ringing"
    }
    val relatedTaskCount = 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Button(
            onClick = onBack,
            colors = ButtonDefaults.buttonColors(containerColor = CardSurface),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp)
        ) {
            Text("Back", color = TextPrimary)
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = contactName,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = phoneLabel,
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextSecondary
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    DetailItem(label = "Type", value = typeLabel)
                    DetailItem(label = "Status", value = statusLabel)
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    DetailItem(label = "Date", value = formatCallDate(call.startTime))
                    DetailItem(label = "Time", value = formatCallTime(call.startTime))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    DetailItem(label = "Duration", value = formatDuration(call.duration))
                    DetailItem(label = "Ended", value = formatCallTime(call.endTime))
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Task",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Button(
                        onClick = { onCreateTask?.invoke() },
                        colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                    ) {
                        Text("+ Create Task")
                    }
                }

                if (relatedTaskCount == 0) {
                    Text(
                        text = "No task created yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun SettingsScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Text(
            text = "Settings",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "CRM Call Tracker",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
                Text(
                    text = "Call tracking and activity monitoring are active.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
            }
        }
    }
}

@Composable
private fun MetricCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    tint: Color,
    tintSoft: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Card(
        modifier = modifier
            .fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = tintSoft,
                    tonalElevation = 0.dp
                ) {
                    Box(
                        modifier = Modifier.padding(8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = tint
                        )
                    }
                }
            }

            Text(
                text = value,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )
        }
    }
}

@Composable
private fun EmptyStateCard(title: String, subtitle: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Outlined.Phone,
                contentDescription = null,
                tint = TextSecondary,
                modifier = Modifier.size(32.dp)
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimary
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
        }
    }
}

@Composable
private fun RecentCallCard(call: CallEvent) {
    val context = LocalContext.current
    var contactName by remember(call.phoneNumber) { mutableStateOf<String?>(null) }

    LaunchedEffect(call.phoneNumber) {
        contactName = ContactMatchHelper.lookupContactName(context, call.phoneNumber)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = contactName ?: call.phoneNumber ?: "Unknown number",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
                Text(
                    text = call.phoneNumber ?: "Unknown number",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
                Text(
                    text = "${call.callType.name.lowercase().replaceFirstChar { it.uppercase() }} • ${call.status.name.lowercase().replaceFirstChar { it.uppercase() }}",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }

            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = formatCallTime(call.startTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
                Text(
                    text = formatDuration(call.duration),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = TextPrimary
                )
            }
        }
    }
}

@Composable
fun TasksScreen(
    tasks: List<TaskDraft>,
    onCreateTask: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Text(
            text = "Tasks",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Button(
            onClick = onCreateTask,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
        ) {
            Text("+ Create Task")
        }

        if (tasks.isEmpty()) {
            EmptyStateCard(
                title = "No tasks created yet",
                subtitle = "Create a task from a detected customer call."
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                tasks.forEach { task ->
                    TaskCard(task)
                }
            }
        }
    }
}

@Composable
private fun TaskCard(task: TaskDraft) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CardSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = task.title.ifBlank { "Untitled task" },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimary
            )
            Text(
                text = task.customerName.ifBlank { "Customer name unavailable" },
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
            Text(
                text = task.customerPhone.ifBlank { "Customer phone unavailable" },
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
            Text(
                text = "Due: ${formatFollowUpDate(task.date)} • ${formatFollowUpTime(task.date)}",
                style = MaterialTheme.typography.bodyMedium,
                color = TextPrimary
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateTaskSheet(
    initialValue: TaskDraft,
    onDismiss: () -> Unit,
    onSave: (TaskDraft) -> Unit
) {
    val context = LocalContext.current
    var selectedDate by remember(initialValue.date) { mutableStateOf(initialValue.date) }
    var title by remember(initialValue.title) { mutableStateOf(initialValue.title) }
    var description by remember(initialValue.description) { mutableStateOf(initialValue.description) }
    var assignTo by remember(initialValue.assignTo) { mutableStateOf(initialValue.assignTo) }
    var validationError by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(false) }
    var recordingSeconds by remember { mutableStateOf(0) }
    var voiceNotePath by remember { mutableStateOf(initialValue.voiceNotePath) }
    var voiceNoteDuration by remember { mutableStateOf(initialValue.voiceNoteDurationSeconds) }
    var attachmentList by remember { mutableStateOf(initialValue.attachments) }
    var voiceRecordingError by remember { mutableStateOf("") }
    val recorder = remember { mutableStateOf<MediaRecorder?>(null) }
    val player = remember { mutableStateOf<MediaPlayer?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted ->
            if (granted) {
                val outputFile = java.io.File(context.cacheDir, "task_voice_${System.currentTimeMillis()}.m4a")
                val existingRecorder = recorder.value
                if (existingRecorder != null || isRecording) {
                    return@rememberLauncherForActivityResult
                }
                try {
                    val mediaRecorder = MediaRecorder()
                    mediaRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
                    mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                    mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                    mediaRecorder.setOutputFile(outputFile.absolutePath)
                    mediaRecorder.prepare()
                    mediaRecorder.start()
                    recorder.value = mediaRecorder
                    voiceNotePath = outputFile.absolutePath
                    voiceRecordingError = ""
                    isRecording = true
                    recordingSeconds = 0
                } catch (e: Exception) {
                    recorder.value?.release()
                    recorder.value = null
                    voiceNotePath = null
                    voiceNoteDuration = 0
                    recordingSeconds = 0
                    isRecording = false
                    voiceRecordingError = "Unable to start voice recording. Please check microphone permission."
                }
            } else {
                recorder.value?.release()
                recorder.value = null
                isRecording = false
                voiceNotePath = null
                voiceNoteDuration = 0
                recordingSeconds = 0
                voiceRecordingError = "Unable to start voice recording. Please check microphone permission."
            }
        }
    )
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents(),
        onResult = { uris ->
            val picked = uris.mapNotNull { uri ->
                val name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
                TaskAttachment(uri = uri, fileName = name)
            }
            attachmentList = attachmentList + picked
        }
    )

    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = selectedDate)
    val timePickerState = rememberTimePickerState(
        initialHour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY),
        initialMinute = java.util.Calendar.getInstance().get(java.util.Calendar.MINUTE),
        is24Hour = false
    )
    var showDatePicker by remember { mutableStateOf(false) }

    fun safeReleaseRecorder() {
        try {
            recorder.value?.apply {
                stop()
                reset()
                release()
            }
        } catch (_: Exception) {
        }
        recorder.value = null
        isRecording = false
    }

    BackHandler(enabled = !showDatePicker) {
        safeReleaseRecorder()
        onDismiss()
    }
    BackHandler(enabled = showDatePicker) {
        showDatePicker = false
    }

    DisposableEffect(Unit) {
        onDispose {
            safeReleaseRecorder()
            player.value?.release()
            player.value = null
        }
    }

    LaunchedEffect(isRecording) {
        if (isRecording) {
            while (isRecording) {
                recordingSeconds += 1
                kotlinx.coroutines.delay(1000)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "Create Task",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )

            OutlinedTextField(
                value = formatFollowUpDate(selectedDate),
                onValueChange = {},
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showDatePicker = true },
                label = { Text("Date") },
                readOnly = true,
                trailingIcon = {
                    IconButton(onClick = { showDatePicker = true }) {
                        Icon(Icons.Outlined.Info, contentDescription = "Open date picker", tint = BrandBlue)
                    }
                }
            )

            if (showDatePicker) {
                DatePickerDialog(
                    onDismissRequest = { showDatePicker = false },
                    confirmButton = {
                        TextButton(onClick = {
                            datePickerState.selectedDateMillis?.let { selectedDate = it }
                            showDatePicker = false
                        }) { Text("OK") }
                    },
                    dismissButton = {
                        TextButton(onClick = { showDatePicker = false }) { Text("Cancel") }
                    }
                ) {
                    DatePicker(state = datePickerState)
                }
            }

            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Task Title*") },
                placeholder = { Text("Enter task title") },
                singleLine = true,
                isError = validationError.isNotEmpty()
            )
            if (validationError.isNotEmpty()) {
                Text(
                    text = validationError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
                label = { Text("Description") },
                placeholder = { Text("Enter task description") }
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(Icons.Outlined.Phone, contentDescription = null, tint = BrandBlue)
                Text(
                    text = "Voice Note",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
            }

            if (voiceRecordingError.isNotEmpty()) {
                Text(
                    text = voiceRecordingError,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }

            if (!isRecording && voiceNotePath == null) {
                Button(
                    onClick = {
                        if (recorder.value != null || isRecording) return@Button
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            return@Button
                        }
                        val outputFile = java.io.File(context.cacheDir, "task_voice_${System.currentTimeMillis()}.m4a")
                        try {
                            val record = MediaRecorder()
                            recorder.value = record
                            record.setAudioSource(MediaRecorder.AudioSource.MIC)
                            record.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                            record.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                            record.setOutputFile(outputFile.absolutePath)
                            record.prepare()
                            record.start()
                            voiceNotePath = outputFile.absolutePath
                            voiceNoteDuration = 0
                            voiceRecordingError = ""
                            isRecording = true
                            recordingSeconds = 0
                        } catch (e: Exception) {
                            recorder.value?.release()
                            recorder.value = null
                            voiceNotePath = null
                            voiceNoteDuration = 0
                            recordingSeconds = 0
                            isRecording = false
                            voiceRecordingError = "Unable to start voice recording. Please check microphone permission."
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFDECEC))
                ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.Phone, contentDescription = null, tint = Color.Red)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Record Voice Note", color = TextPrimary)
                        }
                }
            }

            if (isRecording) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFDECEC))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(Color.Red)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Recording ${formatRecording(recordingSeconds)}")
                        }
                        Button(
                            onClick = {
                                try {
                                    recorder.value?.stop()
                                } catch (_: Exception) {
                                }
                                recorder.value?.release()
                                recorder.value = null
                                isRecording = false
                                voiceNoteDuration = recordingSeconds
                                voiceRecordingError = ""
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                        ) {
                            Text("Stop")
                        }
                    }
                }
            }

            if (voiceNotePath != null && !isRecording) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = CardSurface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Voice note recorded",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                        Text(
                            text = formatRecording(voiceNoteDuration),
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(start = 16.dp, end = 16.dp, bottom = 16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                try {
                                    val media = MediaPlayer().apply {
                                        setDataSource(voiceNotePath)
                                        prepare()
                                        start()
                                    }
                                    player.value?.release()
                                    player.value = media
                                } catch (_: Exception) {
                                    voiceRecordingError = "Unable to play recorded voice note."
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                        ) {
                            Text("Play")
                        }
                        Button(
                            onClick = {
                                try {
                                    player.value?.stop()
                                } catch (_: Exception) {
                                }
                                player.value?.release()
                                player.value = null
                                voiceNotePath = null
                                voiceNoteDuration = 0
                                voiceRecordingError = ""
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = CardSurface)
                        ) {
                            Text("Delete", color = TextPrimary)
                        }
                    }
                }
            }

            Text(
                text = "Attach Files",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimary
            )
            Button(
                onClick = { filePickerLauncher.launch("*/*") },
                colors = ButtonDefaults.buttonColors(containerColor = CardSurface)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Info, contentDescription = null, tint = BrandBlue)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Attach Files", color = TextPrimary)
                }
            }

            if (attachmentList.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    attachmentList.forEach { file ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = CardSurface)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Outlined.Info, contentDescription = null, tint = BrandBlue)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(file.fileName, maxLines = 1)
                                }
                                Button(
                                    onClick = { attachmentList = attachmentList.filterNot { it.uri == file.uri } },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)
                                ) {
                                    Text("Remove", color = TextPrimary)
                                }
                            }
                        }
                    }
                }
            }

            OutlinedTextField(
                value = assignTo,
                onValueChange = { assignTo = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Assign To") },
                placeholder = { Text("Search employee...") },
                singleLine = true,
                trailingIcon = { Icon(Icons.Outlined.Info, contentDescription = "Show suggestions") }
            )

            OutlinedTextField(
                value = initialValue.customerName.ifBlank { "" },
                onValueChange = {},
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Customer Name") },
                readOnly = true
            )

            OutlinedTextField(
                value = initialValue.customerPhone.ifBlank { "" },
                onValueChange = {},
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Customer Phone") },
                readOnly = true
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = {
                        safeReleaseRecorder()
                        onDismiss()
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = CardSurface)
                ) {
                    Text("Cancel", color = TextPrimary)
                }
                Button(
                    onClick = {
                        if (title.isBlank()) {
                            validationError = "Task title is required."
                            return@Button
                        }
                        validationError = ""
                        safeReleaseRecorder()
                        onSave(
                            initialValue.copy(
                                title = title.trim(),
                                description = description.trim(),
                                assignTo = assignTo.trim(),
                                date = selectedDate,
                                voiceNotePath = voiceNotePath,
                                voiceNoteDurationSeconds = voiceNoteDuration,
                                attachments = attachmentList
                            )
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) {
                    Text("Create Task")
                }
            }
        }
    }
}

@Composable
private fun DetailItem(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = TextSecondary
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = TextPrimary
        )
    }
}

private fun formatCallDate(epochMs: Long): String {
    if (epochMs <= 0L) return "Not available"
    val formatter = SimpleDateFormat("MMM d", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

private fun formatCallTime(epochMs: Long): String {
    if (epochMs <= 0L) return "Not available"
    val formatter = SimpleDateFormat("h:mm a", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

private fun formatDuration(durationMs: Long): String {
    if (durationMs <= 0L) return "00:00"
    val totalSeconds = durationMs / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
}

private fun formatFollowUpDate(epochMs: Long): String {
    if (epochMs <= 0L) return "Not set"
    val formatter = SimpleDateFormat("MMM d", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

private fun formatFollowUpTime(epochMs: Long): String {
    if (epochMs <= 0L) return "Not set"
    val formatter = SimpleDateFormat("h:mm a", Locale.getDefault())
    return formatter.format(Date(epochMs))
}

private fun formatRecording(seconds: Int): String {
    val mins = seconds / 60
    val secs = seconds % 60
    return String.format(Locale.getDefault(), "%02d:%02d", mins, secs)
}

private fun isSameDay(first: Long, second: Long): Boolean {
    val firstDate = Date(first)
    val secondDate = Date(second)
    val formatter = SimpleDateFormat("yyyyMMdd", Locale.getDefault())
    return formatter.format(firstDate) == formatter.format(secondDate)
}

data class TaskDraft(
    val customerName: String = "",
    val customerPhone: String = "",
    val date: Long = System.currentTimeMillis(),
    val title: String = "",
    val description: String = "",
    val assignTo: String = "",
    val voiceNotePath: String? = null,
    val voiceNoteDurationSeconds: Int = 0,
    val attachments: List<TaskAttachment> = emptyList()
)

data class TaskAttachment(
    val uri: Uri,
    val fileName: String
)
