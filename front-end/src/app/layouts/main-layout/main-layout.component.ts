import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { FullscreenModeService } from '../../core/services/fullscreen-mode.service';
import { AuthService } from '../../features/auth/auth.service';
import { BreadcrumbComponent } from '../../shared/components/breadcrumb/breadcrumb.component';
import { HeaderCommunicationWalletsComponent } from '../../shared/components/header-communication-wallets/header-communication-wallets.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, CommonModule, BreadcrumbComponent, HeaderCommunicationWalletsComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit, OnDestroy {

  showDropdown = false;
  currentUser: any = null;
  fullscreenActive = false;

  private fullscreenSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private fullscreenMode: FullscreenModeService,
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getUser();

    this.fullscreenSubscription = this.fullscreenMode.activeKey$.subscribe((activeKey) => {
      this.fullscreenActive = Boolean(activeKey);
    });

    this.routerSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.fullscreenMode.syncRoute(this.resolveFullscreenPageKey());
      });

    this.fullscreenMode.syncRoute(this.resolveFullscreenPageKey());
  }

  ngOnDestroy(): void {
    this.fullscreenSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }

  private resolveFullscreenPageKey(): string | null {
    let child = this.route.firstChild;

    while (child) {
      const pageKey = child.snapshot.data?.['fullscreenPageKey'];
      if (typeof pageKey === 'string' && pageKey.trim()) {
        return pageKey.trim();
      }
      child = child.firstChild;
    }

    return null;
  }

  get userInitials(): string {
    const name: string = this.currentUser?.name || '';
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'A';
  }

  get userRole(): string {
    return (this.currentUser?.role || 'user').toLowerCase();
  }

  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  get isTemporaryAdmin(): boolean {
    return this.isAdmin && !!this.currentUser?.isTemporaryAdmin;
  }

  get isEmployee(): boolean {
    const role = this.userRole;
    return role === 'employee' || role === 'user';
  }

  get dashboardSubtitle(): string {
    if (this.isTemporaryAdmin) {
      return 'Secondary Admin';
    }
    return this.isAdmin ? 'Admin Dashboard' : 'Employee Dashboard';
  }

get isChatRoute(): boolean {
  const url = this.router.url.split('?')[0];
  return url.includes('/communication/chats') || url.includes('/manage-chat');
}

get isHubRoute(): boolean {
  const url = this.router.url.split('?')[0];
  return (
    url.startsWith('/communication') ||
    url.startsWith('/customer-management') ||
    url.startsWith('/marketing')
  );
}

get isReminderRoute(): boolean {
  return this.router.url.includes('task-reminders');
}

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
  }

  goToReminders() {
    this.showDropdown = false;
    this.router.navigate(['/task-reminders']);
  }

  goToProfile() {
    this.showDropdown = false;
    this.router.navigate(['/profile']);
  }

  logout() {
    this.showDropdown = false;
    this.currentUser = null;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile')) {
      this.showDropdown = false;
    }
  }

}
