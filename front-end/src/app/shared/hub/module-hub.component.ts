import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { getHubConfig, HubConfig, HubTab } from './hub-config';

@Component({
  selector: 'app-module-hub',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './module-hub.component.html',
  styleUrl: './module-hub.component.scss',
})
export class ModuleHubComponent implements OnInit, OnDestroy {
  hubConfig?: HubConfig;
  activeSegment = '';
  private routerSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const hubId = String(this.route.snapshot.data['hubId'] || '');
    this.hubConfig = getHubConfig(hubId);
    this.syncActiveSegment();

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.syncActiveSegment());
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  get visibleTabs(): HubTab[] {
    return (this.hubConfig?.tabs || []).filter((tab) => !tab.comingSoon || !tab.disabled);
  }

  get futureTabs(): HubTab[] {
    return (this.hubConfig?.tabs || []).filter((tab) => tab.comingSoon && tab.disabled);
  }

  isTabActive(tab: HubTab): boolean {
    if (tab.segment === this.activeSegment) {
      return true;
    }

    const legacy = tab.legacySegments || [];
    return legacy.some((segment) => segment === this.activeSegment);
  }

  tabLink(tab: HubTab): string[] {
    return [this.hubConfig?.basePath || '/', tab.segment];
  }

  private syncActiveSegment(): void {
    const url = this.router.url.split('?')[0];
    const base = this.hubConfig?.basePath || '';
    const relative = url.startsWith(base) ? url.slice(base.length).replace(/^\//, '') : '';
    const firstSegment = relative.split('/')[0] || '';

    const matched = this.hubConfig?.tabs.find(
      (tab) =>
        tab.segment === firstSegment ||
        (tab.legacySegments || []).includes(firstSegment),
    );

    this.activeSegment = matched?.segment || firstSegment;
  }
}
