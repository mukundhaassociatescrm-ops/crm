import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import {
  findActiveSectionId,
  SIDEBAR_DASHBOARD_LINK,
  SIDEBAR_SECTIONS,
  SIDEBAR_STANDALONE_LINKS,
  SidebarNavItem,
  SidebarNavLink,
  SidebarNavSection,
  urlMatchesNavItem,
} from './sidebar-nav.config';

const COLLAPSED_KEY = 'crm-sidebar-collapsed-v1';
const SECTIONS_KEY = 'crm-sidebar-sections-v1';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent implements OnInit, OnDestroy {
  @Input() isPrimaryAdmin = true;
  @Input() mobileOpen = false;
  @Output() mobileOpenChange = new EventEmitter<boolean>();
  @Output() collapsedChange = new EventEmitter<boolean>();

  collapsed = false;
  expandedSections = new Set<string>();
  currentUrl = '';

  readonly dashboardLink = SIDEBAR_DASHBOARD_LINK;
  readonly sections = SIDEBAR_SECTIONS;
  readonly standaloneLinks = SIDEBAR_STANDALONE_LINKS;

  private routerSub?: Subscription;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    this.collapsed = this.readCollapsedPreference();
    this.expandedSections = this.readSectionPreferences();
    this.syncFromUrl(this.router.url);
    this.collapsedChange.emit(this.collapsed);

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => {
        this.syncFromUrl(this.router.url);
        this.closeMobile();
      });
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  get visibleStandaloneLinks(): SidebarNavLink[] {
    return this.standaloneLinks.filter((link) => !link.primaryAdminOnly || this.isPrimaryAdmin);
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections.has(sectionId);
  }

  isItemActive(item: SidebarNavItem | SidebarNavLink): boolean {
    return urlMatchesNavItem(this.currentUrl, item);
  }

  isSectionActive(section: SidebarNavSection): boolean {
    return section.items.some((item) => this.isItemActive(item));
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(this.collapsed));
    this.collapsedChange.emit(this.collapsed);
  }

  onSectionClick(section: SidebarNavSection, event?: Event): void {
    if (this.collapsed) {
      event?.preventDefault();
      event?.stopPropagation();
      const activeItem = section.items.find((item) => this.isItemActive(item));
      if (activeItem) {
        this.setCollapsed(false);
        this.expandedSections.add(section.id);
        this.persistSections();
        return;
      }
      this.router.navigate([section.items[0].route]);
      this.closeMobile();
      return;
    }
    this.toggleSection(section.id, event);
  }

  private setCollapsed(value: boolean): void {
    this.collapsed = value;
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(value));
    this.collapsedChange.emit(value);
  }

  toggleSection(sectionId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.collapsed) {
      this.setCollapsed(false);
    }
    if (this.expandedSections.has(sectionId)) {
      this.expandedSections.delete(sectionId);
    } else {
      this.expandedSections.add(sectionId);
    }
    this.persistSections();
  }

  closeMobile(): void {
    if (this.mobileOpen) {
      this.mobileOpen = false;
      this.mobileOpenChange.emit(false);
    }
  }

  onNavClick(): void {
    this.closeMobile();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 1024 && this.mobileOpen) {
      this.closeMobile();
    }
  }

  private syncFromUrl(url: string): void {
    this.currentUrl = url.split('?')[0];
    const activeSection = findActiveSectionId(this.currentUrl);
    if (activeSection) {
      this.expandedSections.add(activeSection);
      this.persistSections();
    }
  }

  private readCollapsedPreference(): boolean {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw == null) {
        return window.innerWidth < 1024;
      }
      return JSON.parse(raw) === true;
    } catch {
      return false;
    }
  }

  private readSectionPreferences(): Set<string> {
    try {
      const raw = localStorage.getItem(SECTIONS_KEY);
      if (!raw) {
        return new Set(['communication']);
      }
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : ['communication']);
    } catch {
      return new Set(['communication']);
    }
  }

  private persistSections(): void {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify([...this.expandedSections]));
  }
}
