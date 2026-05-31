import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  DashboardActivityItem,
  DashboardInsights,
  DashboardStatsService,
} from '../../../core/services/dashboard-stats.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf, NgFor, NgClass, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, OnDestroy {
  public displayName = 'Admin';
  public userRole: 'admin' | 'employee' = 'employee';
  public temporaryAdmin = false;
  public loading = true;
  public insights: DashboardInsights = {
    kpis: {
      totalClients: 0,
      activeEmployees: 0,
      totalTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      unreadChats: 0,
      whatsappMessagesToday: 0,
      smsSentToday: 0,
      activeCampaigns: 0,
    },
    activity: [],
  };

  private insightsSub?: Subscription;
  private loadingSub?: Subscription;

  constructor(
    private router: Router,
    private authService: AuthService,
    private dashboardStats: DashboardStatsService,
  ) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.displayName = user?.name || user?.fullName || user?.email?.split('@')[0] || 'Admin';
    this.userRole = this.authService.isAdmin() ? 'admin' : 'employee';
    this.temporaryAdmin = this.authService.isTemporaryAdmin();

    if (this.isAdmin) {
      this.insights = this.dashboardStats.snapshot;
      this.loading = true;
      this.dashboardStats.refresh();
      this.insightsSub = this.dashboardStats.insights$.subscribe((insights) => {
        this.insights = insights;
      });
      this.loadingSub = this.dashboardStats.loading$.subscribe((loading) => {
        this.loading = loading;
      });
    } else {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.insightsSub?.unsubscribe();
    this.loadingSub?.unsubscribe();
  }

  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  get isEmployee(): boolean {
    return this.userRole === 'employee';
  }

  get showMyTaskLink(): boolean {
    return this.isEmployee || this.temporaryAdmin;
  }

  get kpis() {
    return this.insights.kpis;
  }

  get activity(): DashboardActivityItem[] {
    return this.insights.activity;
  }

  get todayMessagesTotal(): number {
    return this.kpis.whatsappMessagesToday + this.kpis.smsSentToday;
  }

  public refresh(): void {
    if (this.isAdmin) {
      this.dashboardStats.refresh();
    }
  }

  public goToMyTask(): void {
    this.router.navigate(['employee-dashboard']);
  }

  public activityIcon(kind: DashboardActivityItem['kind']): string {
    switch (kind) {
      case 'task-created':
        return 'fa-solid fa-plus';
      case 'task-completed':
        return 'fa-solid fa-circle-check';
      case 'task-assigned':
        return 'fa-solid fa-user-check';
      case 'client-added':
        return 'fa-solid fa-user-plus';
      case 'campaign-sent':
        return 'fa-solid fa-paper-plane';
      case 'poster-viewed':
        return 'fa-solid fa-eye';
      case 'report-sent':
        return 'fa-regular fa-file-lines';
      case 'payment-received':
        return 'fa-solid fa-indian-rupee-sign';
      default:
        return 'fa-solid fa-clock-rotate-left';
    }
  }

  public activityTone(kind: DashboardActivityItem['kind']): string {
    switch (kind) {
      case 'task-completed':
      case 'payment-received':
        return 'tone-success';
      case 'campaign-sent':
      case 'report-sent':
        return 'tone-primary';
      case 'client-added':
        return 'tone-purple';
      case 'poster-viewed':
        return 'tone-pink';
      case 'task-created':
      case 'task-assigned':
        return 'tone-warning';
      default:
        return 'tone-muted';
    }
  }
}
