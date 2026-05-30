import { NgIf } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DashboardHubBadges, DashboardStatsService } from '../../../core/services/dashboard-stats.service';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  public displayName = 'Admin';
  public userRole: 'admin' | 'employee' = 'employee';
  public temporaryAdmin = false;
  public badges: DashboardHubBadges = {
    communicationUnread: 0,
    clientCount: 0,
    posterCount: 0,
  };

  private badgesSub?: Subscription;

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
      this.badges = this.dashboardStats.snapshot;
      this.dashboardStats.refresh();
      this.badgesSub = this.dashboardStats.badges$.subscribe((badges) => {
        this.badges = badges;
      });
    }
  }

  ngOnDestroy(): void {
    this.badgesSub?.unsubscribe();
  }

  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  get isEmployee(): boolean {
    return this.userRole === 'employee';
  }

  get isPrimaryAdmin(): boolean {
    return this.isAdmin && !this.temporaryAdmin;
  }

  get showMyTask(): boolean {
    return this.isEmployee || this.temporaryAdmin;
  }

  public goToMyTask(): void {
    if (this.temporaryAdmin || this.isEmployee) {
      this.router.navigate(['employee-dashboard']);
      return;
    }

    this.router.navigate(['manage-task']);
  }

  public nav(route: string): void {
    this.router.navigate([route]);
  }
}
