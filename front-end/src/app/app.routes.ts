import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { DashboardComponent } from './features/dashboard/dashboard/dashboard.component';
import { ManageEmployeeComponent } from './features/manage-employee/manage-employee/manage-employee.component';
import { ManageTaskComponent } from './features/manage-task/manage-task/manage-task.component';
import { ManageChatComponent } from './features/manage-chat/manage-chat/manage-chat.component';
import { ManageGroupComponent } from './features/manage-group/manage-group.component';
import { ManageBulkMessageComponent } from './features/manage-bulk-message/manage-bulk-message.component';
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
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  { path: 'login', component: LoginComponent },
  { path: 'contact-us', component: ContactUsComponent },
  { path: 'superadmin/create-admin', component: SuperadminCreateAdminComponent },

  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent, data: { breadcrumb: 'Dashboard' } },
      { path: 'manage-employee', component: ManageEmployeeComponent, data: { role: 'admin', breadcrumb: 'Manage Employee' } },
      { path: 'manage-task', component: ManageTaskComponent, canActivate: [AuthGuard], data: { breadcrumb: 'Manage Task' } },
      { path: 'task-reminders', component: TaskRemindersComponent, canActivate: [AuthGuard], data: { breadcrumb: 'Task Reminders' } },
      { path: 'manage-chat', component: ManageChatComponent, canActivate: [AuthGuard], data: { role: 'admin', breadcrumb: 'Manage Chat' } },
      {
        path: 'manage-group',
        component: ManageGroupComponent,
        data: { role: 'admin', breadcrumb: 'Manage Group' }
      },
      {
        path: 'manage-bulk-message',
        component: ManageBulkMessageComponent,
        data: { role: 'admin', breadcrumb: 'Bulk Messaging' }
      },
      {
        path: 'manage-report',
        component: ManageReportComponent,
        data: { role: 'admin', breadcrumb: 'Manage Report' }
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
        path: 'clients',
        component: ManageClientComponent,
        canActivate: [AuthGuard],
        data: { role: 'admin', breadcrumb: 'Manage Clients' }
      },
      {
        path: 'work-history',
        component: WorkHistoryComponent,
        canActivate: [AuthGuard],
        data: { role: 'admin', breadcrumb: 'Work History' }
      },
      {
        path: 'sms',
        component: SmsComponent,
        canActivate: [AuthGuard],
        data: { role: 'admin', breadcrumb: 'SMS' }
      }
    ]
  }
];

