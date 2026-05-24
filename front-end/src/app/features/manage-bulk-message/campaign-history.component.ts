import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { CampaignSummary, WhatsappCampaignService } from './whatsapp-campaign.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

@Component({
  selector: 'app-campaign-history',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FullscreenToggleComponent],
  templateUrl: './campaign-history.component.html',
  styleUrl: './campaign-history.component.scss',
})
export class CampaignHistoryComponent implements OnInit, OnDestroy {
  campaigns: CampaignSummary[] = [];
  total = 0;
  page = 1;
  pageSize = 30;
  search = '';
  statusFilter = '';
  isLoading = false;

  private readonly destroy$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor(
    private readonly campaignService: WhatsappCampaignService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.load();
    this.search$.pipe(debounceTime(350), takeUntil(this.destroy$)).subscribe(() => {
      this.page = 1;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  queuedCount(c: CampaignSummary): number {
    return (c.stats?.queued || 0) + (c.stats?.waitingDailyLimit || 0);
  }

  onSearchChange(): void {
    this.search$.next(this.search);
  }

  onFilterChange(): void {
    this.page = 1;
    this.load();
  }

  goPage(next: number): void {
    if (next < 1 || next > this.totalPages) {
      return;
    }
    this.page = next;
    this.load();
  }

  openCampaign(c: CampaignSummary): void {
    this.router.navigate(['/whatsapp-campaign-tracking', c.id]);
  }

  private load(): void {
    this.isLoading = true;
    const skip = (this.page - 1) * this.pageSize;
    this.campaignService
      .listCampaigns({
        limit: this.pageSize,
        skip,
        search: this.search.trim(),
        status: this.statusFilter,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          this.campaigns = res.data?.campaigns || [];
          this.total = res.data?.total || 0;
        },
        error: () => {
          this.isLoading = false;
        },
      });
  }
}
