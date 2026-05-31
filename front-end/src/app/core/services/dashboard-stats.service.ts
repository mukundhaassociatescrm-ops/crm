import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, of } from 'rxjs';

export type DashboardActivityKind =
  | 'task-created'
  | 'task-completed'
  | 'task-assigned'
  | 'task-updated'
  | 'client-added'
  | 'campaign-sent'
  | 'poster-viewed'
  | 'report-sent'
  | 'payment-received';

export interface DashboardKpis {
  totalClients: number;
  activeEmployees: number;
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  unreadChats: number;
  whatsappMessagesToday: number;
  smsSentToday: number;
  activeCampaigns: number;
}

export interface DashboardActivityItem {
  id: string;
  kind: DashboardActivityKind;
  title: string;
  subtitle: string;
  createdAt: string;
}

export interface DashboardInsights {
  kpis: DashboardKpis;
  activity: DashboardActivityItem[];
}

export interface DashboardOverviewResponse {
  success: boolean;
  data: DashboardInsights;
}

const EMPTY_KPIS: DashboardKpis = {
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
};

const EMPTY_INSIGHTS: DashboardInsights = {
  kpis: EMPTY_KPIS,
  activity: [],
};

@Injectable({ providedIn: 'root' })
export class DashboardStatsService {
  private readonly insightsSubject = new BehaviorSubject<DashboardInsights>(EMPTY_INSIGHTS);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);

  readonly insights$ = this.insightsSubject.asObservable();
  readonly loading$ = this.loadingSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  refresh(): void {
    this.loadingSubject.next(true);

    this.http.get<DashboardOverviewResponse>('/api/dashboard/overview').pipe(
      catchError(() => of({ success: false, data: EMPTY_INSIGHTS })),
    ).subscribe((response) => {
      this.insightsSubject.next(response?.data || EMPTY_INSIGHTS);
      this.loadingSubject.next(false);
    });
  }

  get snapshot(): DashboardInsights {
    return this.insightsSubject.value;
  }
}
