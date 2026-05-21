import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import {
  getSmsTemplateMessageId,
  hasSmsTemplateMessageId,
  SmsTemplate,
  SmsTemplateService,
} from './sms-template.service';

@Component({
  selector: 'app-manage-sms-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-sms-templates.component.html',
  styleUrl: './manage-sms-templates.component.scss',
})
export class ManageSmsTemplatesComponent implements OnInit, OnDestroy {
  templates: SmsTemplate[] = [];
  searchTerm = '';
  isLoading = false;
  isSyncing = false;
  isImporting = false;
  showExcelFallback = false;
  selectedTemplate: SmsTemplate | null = null;

  totalTemplates = 0;
  currentPage = 1;
  readonly pageSize = 50;

  private readonly destroy$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor(
    private readonly smsTemplateService: SmsTemplateService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage = 1;
        this.loadTemplates();
      });

    this.loadTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void {
    this.search$.next(this.searchTerm);
  }

  syncTemplates(): void {
    this.isSyncing = true;
    this.smsTemplateService
      .syncTemplates()
      .pipe(finalize(() => {
        this.isSyncing = false;
      }))
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toastr.error('Template sync failed', 'SMS Templates');
            return;
          }

          this.toastr.success('Templates synced successfully');
          this.toastr.info(
            `Synced ${response.synced}: ${response.created} created, ${response.updated} updated`,
            'Fast2SMS',
          );
          this.loadTemplates();
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to sync templates from Fast2SMS', 'SMS Templates');
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isImporting = true;
    this.smsTemplateService
      .importTemplates(file)
      .pipe(finalize(() => {
        this.isImporting = false;
        input.value = '';
      }))
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toastr.error(response.message || 'Import failed', 'SMS Templates');
            return;
          }

          const summary = response.data;
          this.toastr.success(
            `Excel fallback: ${summary.created} new, ${summary.updated} updated`,
            'SMS Templates',
          );
          this.loadTemplates();
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to import SMS templates', 'SMS Templates');
        },
      });
  }

  openPreview(template: SmsTemplate): void {
    this.selectedTemplate = template;
  }

  closePreview(): void {
    this.selectedTemplate = null;
  }

  isMessageIdConfigured(template: SmsTemplate): boolean {
    return hasSmsTemplateMessageId(template);
  }

  displayMessageId(template: SmsTemplate): string {
    return hasSmsTemplateMessageId(template) ? getSmsTemplateMessageId(template) : 'Not Configured';
  }

  displayProvider(template: SmsTemplate): string {
    const provider = String(template.provider || 'fast2sms').trim();
    return provider === 'excel' ? 'Excel (fallback)' : 'Fast2SMS';
  }

  displaySyncedAt(template: SmsTemplate): string {
    if (!template.syncedAt) {
      return template.provider === 'excel' ? '—' : 'Never';
    }
    return new Date(template.syncedAt).toLocaleString();
  }

  displayStatus(template: SmsTemplate): string {
    if (template.isActive) {
      return 'Active';
    }
    const approval = String(template.approvalStatus || template.jioStatus || '').trim();
    return approval || 'Inactive';
  }

  toggleActive(template: SmsTemplate): void {
    const nextActive = !template.isActive;
    this.smsTemplateService.setTemplateActive(template._id, nextActive).subscribe({
      next: (response) => {
        if (!response.success) {
          return;
        }
        template.isActive = response.data.isActive;
        this.toastr.success(
          `Template ${template.templateName || template.templateId} marked ${nextActive ? 'active' : 'inactive'}`,
        );
      },
      error: (error) => {
        this.toastr.error(error?.error?.message || 'Unable to update template status');
      },
    });
  }

  trackById(_: number, item: SmsTemplate): string {
    return item._id;
  }

  private loadTemplates(): void {
    this.isLoading = true;
    this.smsTemplateService
      .getTemplates({
        includeInactive: true,
        search: this.searchTerm.trim() || undefined,
        page: this.currentPage,
        limit: this.pageSize,
      })
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: (response) => {
          this.templates = response.success && Array.isArray(response.data) ? response.data : [];
          this.totalTemplates = response.meta?.total ?? this.templates.length;
        },
        error: () => {
          this.templates = [];
          this.totalTemplates = 0;
          this.toastr.error('Unable to load SMS templates');
        },
      });
  }
}
