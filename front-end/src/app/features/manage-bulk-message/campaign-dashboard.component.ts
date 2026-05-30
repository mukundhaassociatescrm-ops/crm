import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { ToastrService } from 'ngx-toastr';
import {
  CampaignRecipient,
  CampaignSummary,
  WhatsappCampaignService,
} from './whatsapp-campaign.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Queued', label: 'Queued' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Read', label: 'Read' },
  { value: 'Sending', label: 'Sending' },
  { value: 'Waiting Queue', label: 'Waiting queue' },
];

@Component({
  selector: 'app-campaign-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FullscreenToggleComponent],
  templateUrl: './campaign-dashboard.component.html',
  styleUrl: './campaign-dashboard.component.scss',
})
export class CampaignDashboardComponent implements OnInit, OnDestroy {
  readonly statusFilters = STATUS_FILTERS;
  readonly pageSize = 100;

  campaignId = '';
  campaign: CampaignSummary | null = null;
  recipients: CampaignRecipient[] = [];
  recipientTotal = 0;
  queue: Record<string, number> = {};
  usage = { limit: 0, used: 0, remaining: 0 };

  statusFilter = '';
  search = '';
  page = 1;
  isLoading = true;

  private socket: Socket | null = null;
  private readonly destroy$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly campaignService: WhatsappCampaignService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.campaignId = String(this.route.snapshot.paramMap.get('id') || '');
    if (!this.campaignId) {
      this.router.navigate(['/communication/campaign-tracking']);
      return;
    }

    this.loadCampaign();
    this.loadRecipients();
    this.connectSocket();

    this.search$.pipe(debounceTime(350), takeUntil(this.destroy$)).subscribe(() => {
      this.page = 1;
      this.loadRecipients();
    });

    interval(8000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadCampaign(false);
        this.loadRecipients();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.socket?.disconnect();
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.recipientTotal / this.pageSize));
  }

  get progressPercent(): number {
    const total = this.campaign?.stats?.total || 0;
    if (!total) {
      return 0;
    }
    const done = (this.campaign?.stats?.delivered || 0)
      + (this.campaign?.stats?.failed || 0)
      + (this.campaign?.stats?.skipped || 0)
      + (this.campaign?.stats?.sessionSent || 0);
    return Math.min(100, Math.round((done / total) * 100));
  }

  displayStatus(status: string): string {
    if (status === 'WaitingDailyLimit') {
      return 'Waiting Queue';
    }
    if (status === 'SessionSent') {
      return 'Delivered';
    }
    return status;
  }

  onSearchChange(): void {
    this.search$.next(this.search);
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadRecipients();
  }

  goPage(next: number): void {
    if (next < 1 || next > this.totalPages) {
      return;
    }
    this.page = next;
    this.loadRecipients();
  }

  pause(): void {
    this.campaignService.pauseCampaign(this.campaignId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.info('Campaign paused');
        this.loadCampaign(false);
      },
    });
  }

  resume(): void {
    this.campaignService.resumeCampaign(this.campaignId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Campaign resumed');
        this.loadCampaign(false);
      },
    });
  }

  retryFailed(): void {
    this.campaignService.retryFailed(this.campaignId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Failed recipients re-queued');
        this.loadCampaign(false);
        this.loadRecipients();
      },
    });
  }

  exportCsv(): void {
    this.campaignService
      .getRecipients(this.campaignId, { status: this.statusFilter || undefined, search: this.search.trim(), limit: 5000 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const rows = res.data?.recipients || [];
          const header = ['Customer', 'Phone', 'Status', 'Scheduled', 'Delivered', 'Failure Reason'];
          const lines = rows.map((r) => [
            r.customerName,
            r.phone,
            this.displayStatus(r.status),
            r.scheduledAt ? new Date(r.scheduledAt).toISOString() : '',
            r.deliveredAt ? new Date(r.deliveredAt).toISOString() : '',
            r.failureReason || r.reason || '',
          ]);
          const csv = [header, ...lines]
            .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `campaign-${this.campaignId}.csv`;
          link.click();
          URL.revokeObjectURL(url);
        },
      });
  }

  private loadCampaign(showSpinner = true): void {
    if (showSpinner) {
      this.isLoading = true;
    }
    this.campaignService.getCampaign(this.campaignId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.campaign = res.data?.campaign || null;
        this.queue = res.data?.queue || {};
        this.usage = res.data?.usage || this.usage;
      },
      error: () => {
        this.isLoading = false;
        this.toastr.error('Failed to load campaign');
      },
    });
  }

  private loadRecipients(): void {
    const skip = (this.page - 1) * this.pageSize;
    this.campaignService
      .getRecipients(this.campaignId, {
        status: this.statusFilter || undefined,
        search: this.search.trim(),
        limit: this.pageSize,
        skip,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.recipients = res.data?.recipients || [];
          this.recipientTotal = res.data?.total || 0;
        },
      });
  }

  private connectSocket(): void {
    this.socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    this.socket.on('campaign:update', (event: { campaignId?: string }) => {
      if (String(event?.campaignId) === this.campaignId) {
        this.loadCampaign(false);
        this.loadRecipients();
      }
    });
  }
}
