import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { CreatePasswordComponent } from './features/auth/create-password/create-password.component';
import { PendingPasswordResetGuard } from './core/pending-password-reset.guard';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { DashboardComponent } from './features/dashboard/dashboard/dashboard.component';
import { ManageEmployeeComponent } from './features/manage-employee/manage-employee/manage-employee.component';
import { ManageTaskComponent } from './features/manage-task/manage-task/manage-task.component';
import { ManageChatComponent } from './features/manage-chat/manage-chat/manage-chat.component';
import { ManageGroupComponent } from './features/manage-group/manage-group.component';
import { ManageBulkMessageComponent } from './features/manage-bulk-message/manage-bulk-message.component';
import { CampaignDashboardComponent } from './features/manage-bulk-message/campaign-dashboard.component';
import { CampaignHistoryComponent } from './features/manage-bulk-message/campaign-history.component';
import { BulkSmsComponent } from './features/bulk-sms/bulk-sms.component';
import { EmployeeDashboardComponent } from './features/employee-dashboard/employee-dashboard.component';
import { TaskRemindersComponent } from './features/task-reminders/task-reminders.component';
import { ProfileComponent } from './features/profile/profile.component';
import { ContactUsComponent } from './features/contact-us/contact-us.component';
import { ManageReportComponent } from './features/manage-report/manage-report.component';
import { SuperadminCreateAdminComponent } from './features/superadmin-create-admin/superadmin-create-admin.component';
import { ManageClientComponent } from './features/manage-client/manage-client/manage-client.component';
import { WorkHistoryComponent } from './features/work-history/work-history.component';
import { AuthGuard } from './core/auth.guard';
import { SmsComponent } from './features/sms/sms.component';
import { ManageSmsTemplatesComponent } from './features/manage-sms-templates/manage-sms-templates.component';
import { ManagePostersComponent } from './features/manage-posters/manage-posters.component';
import { PosterLandingComponent } from './features/manage-posters/poster-landing.component';
import { HubPassthroughComponent } from './shared/hub/hub-passthrough.component';

const adminHub = { role: 'admin' as const };

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  { path: 'login', component: LoginComponent },
  { path: 'create-password', component: CreatePasswordComponent, canActivate: [PendingPasswordResetGuard] },
  { path: 'contact-us', component: ContactUsComponent },
  { path: 'posters/:slug', component: PosterLandingComponent },
  { path: 'superadmin/create-admin', component: SuperadminCreateAdminComponent },

  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent, data: { breadcrumb: 'Dashboard' } },
      { path: 'manage-employee', component: ManageEmployeeComponent, data: { ...adminHub, breadcrumb: 'Employees', fullscreenPageKey: 'manage-employee' } },
      { path: 'manage-task', component: ManageTaskComponent, canActivate: [AuthGuard], data: { breadcrumb: 'Tasks', fullscreenPageKey: 'manage-task' } },
      { path: 'task-reminders', component: TaskRemindersComponent, canActivate: [AuthGuard], data: { breadcrumb: 'Task Reminders', fullscreenPageKey: 'task-reminders' } },

      {
        path: 'communication',
        component: HubPassthroughComponent,
        data: { ...adminHub, hubId: 'communication', breadcrumb: 'Communication' },
        children: [
          { path: '', redirectTo: 'chats', pathMatch: 'full' },
          {
            path: 'chats',
            component: ManageChatComponent,
            data: { ...adminHub, breadcrumb: 'Chats', fullscreenPageKey: 'manage-chat' },
          },
          {
            path: 'whatsapp-campaigns',
            component: ManageBulkMessageComponent,
            data: { ...adminHub, breadcrumb: 'WhatsApp Campaigns', fullscreenPageKey: 'whatsapp-campaigns' },
          },
          {
            path: 'whatsapp-campaigns/:id',
            component: CampaignDashboardComponent,
            data: { ...adminHub, breadcrumb: 'Campaign detail', fullscreenPageKey: 'whatsapp-campaigns' },
          },
          {
            path: 'campaign-tracking',
            component: CampaignHistoryComponent,
            data: { ...adminHub, breadcrumb: 'Campaign Tracking', fullscreenPageKey: 'whatsapp-campaigns' },
          },
          {
            path: 'campaign-tracking/:id',
            component: CampaignDashboardComponent,
            data: { ...adminHub, breadcrumb: 'Campaign detail', fullscreenPageKey: 'whatsapp-campaigns' },
          },
          {
            path: 'bulk-sms',
            component: BulkSmsComponent,
            data: { ...adminHub, breadcrumb: 'Bulk SMS', fullscreenPageKey: 'bulk-sms' },
          },
          {
            path: 'quick-sms',
            component: SmsComponent,
            data: { ...adminHub, breadcrumb: 'Quick SMS', fullscreenPageKey: 'sms' },
          },
        ],
      },

      {
        path: 'customer-management',
        component: HubPassthroughComponent,
        data: { ...adminHub, hubId: 'customer-management', breadcrumb: 'Customer Management' },
        children: [
          { path: '', redirectTo: 'groups', pathMatch: 'full' },
          {
            path: 'groups',
            component: ManageGroupComponent,
            data: { ...adminHub, breadcrumb: 'Groups', fullscreenPageKey: 'manage-group' },
          },
          {
            path: 'clients',
            component: ManageClientComponent,
            data: { ...adminHub, breadcrumb: 'Clients', fullscreenPageKey: 'manage-client' },
          },
        ],
      },

      {
        path: 'marketing',
        component: HubPassthroughComponent,
        data: { ...adminHub, hubId: 'marketing', breadcrumb: 'Marketing' },
        children: [
          { path: '', redirectTo: 'posters', pathMatch: 'full' },
          {
            path: 'posters',
            component: ManagePostersComponent,
            data: { ...adminHub, breadcrumb: 'Poster Management', fullscreenPageKey: 'poster-management' },
          },
        ],
      },

      // Legacy URLs — backward compatibility (preserve bookmarks & external links)
      { path: 'manage-chat', redirectTo: 'communication/chats', pathMatch: 'full' },
      { path: 'chat', redirectTo: 'communication/chats', pathMatch: 'full' },
      { path: 'whatsapp-campaigns', redirectTo: 'communication/whatsapp-campaigns', pathMatch: 'full' },
      { path: 'whatsapp-campaigns/:id', redirectTo: 'communication/whatsapp-campaigns/:id' },
      { path: 'whatsapp-campaign-tracking', redirectTo: 'communication/campaign-tracking', pathMatch: 'full' },
      { path: 'whatsapp-campaign-tracking/:id', redirectTo: 'communication/campaign-tracking/:id' },
      { path: 'campaign-tracking', redirectTo: 'communication/campaign-tracking', pathMatch: 'full' },
      { path: 'campaign-tracking/:id', redirectTo: 'communication/campaign-tracking/:id' },
      { path: 'bulk-sms', redirectTo: 'communication/bulk-sms', pathMatch: 'full' },
      { path: 'sms', redirectTo: 'communication/quick-sms', pathMatch: 'full' },
      { path: 'manage-bulk-message', redirectTo: 'communication/whatsapp-campaigns', pathMatch: 'full' },
      { path: 'manage-group', redirectTo: 'customer-management/groups', pathMatch: 'full' },
      { path: 'groups', redirectTo: 'customer-management/groups', pathMatch: 'full' },
      { path: 'clients', redirectTo: 'customer-management/clients', pathMatch: 'full' },
      { path: 'poster-management', redirectTo: 'marketing/posters', pathMatch: 'full' },

      {
        path: 'manage-report',
        component: ManageReportComponent,
        data: { ...adminHub, breadcrumb: 'Reports', fullscreenPageKey: 'manage-report' }
      },
      {
        path: 'employee-dashboard',
        component: EmployeeDashboardComponent,
        data: { role: 'employee', breadcrumb: 'Employee Dashboard' }
      },
      {
        path: 'profile',
        component: ProfileComponent,
        canActivate: [AuthGuard],
        data: { breadcrumb: 'My Profile' }
      },
      {
        path: 'work-history',
        component: WorkHistoryComponent,
        canActivate: [AuthGuard],
        data: { ...adminHub, breadcrumb: 'Work History', fullscreenPageKey: 'work-history' }
      },
      {
        path: 'manage-sms-templates',
        component: ManageSmsTemplatesComponent,
        canActivate: [AuthGuard],
        data: { ...adminHub, breadcrumb: 'Manage SMS Templates', fullscreenPageKey: 'manage-sms-templates' }
      },
    ]
  }
];
