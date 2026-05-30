import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { catchError, finalize, of } from 'rxjs';
import { Client, ClientService } from '../manage-client/client.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { SmsWalletBalanceComponent } from '../../shared/components/sms-wallet-balance/sms-wallet-balance.component';
import {
  getSmsTemplateContent,
  getSmsTemplateReadinessIssues,
  isSmsTemplateReadyToSend,
  SmsTemplate,
  SmsTemplateService,
} from '../manage-sms-templates/sms-template.service';
import {
  buildSmsVariablesArray,
  renderSmsTemplatePreview,
  resolveSmsTemplateVariableSlots,
  SmsTemplateVariableSlot,
} from '../manage-sms-templates/sms-template-variable.utils';

type SmsClient = Pick<Client, '_id' | 'name' | 'mobile'>;
type SmsSendResponse =
  | {
      success: true;
      phone: string;
      templateId?: string;
      variablesValues?: string;
      providerResponse?: unknown;
    }
  | { success: false; message?: string };

@Component({
  selector: 'app-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './sms.component.html',
  styleUrl: './sms.component.scss',
})
export class SmsComponent implements OnInit, OnDestroy {
  clients: SmsClient[] = [];
  isLoadingClients = false;
  selectedClient: SmsClient | null = null;
  searchQuery = '';
  isSending = false;
  smsTemplates: SmsTemplate[] = [];
  selectedSmsTemplateRecordId = '';
  templateVariables: Record<number, string> = {};
  isLoadingTemplates = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;

  constructor(
    private readonly clientService: ClientService,
    private readonly http: HttpClient,
    private readonly toastr: ToastrService,
    private readonly smsTemplateService: SmsTemplateService,
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadSmsTemplates();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  get selectedSmsTemplate(): SmsTemplate | null {
    return this.smsTemplates.find((item) => item._id === this.selectedSmsTemplateRecordId) || null;
  }

  get templateVariableSlots(): SmsTemplateVariableSlot[] {
    return resolveSmsTemplateVariableSlots(this.selectedSmsTemplate);
  }

  get templateVariableLabel(): string {
    const count = this.templateVariableSlots.length;
    if (!this.selectedSmsTemplateRecordId) {
      return '';
    }
    if (count === 0) {
      return 'No variables required';
    }
    return `${count} variable${count === 1 ? '' : 's'} required`;
  }

  get templatePreview(): string {
    if (!this.selectedSmsTemplate) {
      return 'Select a DLT template to preview the message.';
    }
    return renderSmsTemplatePreview(
      getSmsTemplateContent(this.selectedSmsTemplate),
      this.templateVariables,
    );
  }

  get templateReadinessIssues(): string[] {
    if (!this.selectedSmsTemplateRecordId) {
      return [];
    }
    return getSmsTemplateReadinessIssues(this.selectedSmsTemplate);
  }

  get selectedTemplateNotReady(): boolean {
    return this.templateReadinessIssues.length > 0;
  }

  get canSend(): boolean {
    if (!this.selectedClient || !this.selectedSmsTemplateRecordId || this.isSending) {
      return false;
    }

    if (!isSmsTemplateReadyToSend(this.selectedSmsTemplate)) {
      return false;
    }

    const slots = this.templateVariableSlots;
    if (!slots.length) {
      return true;
    }

    return slots.every((slot) => String(this.templateVariables[slot.index] || '').trim().length > 0);
  }

  onSmsTemplateChanged(): void {
    this.syncTemplateVariableMap();
    this.focusFirstVariableInput();
    console.log('[SINGLE SMS TEMPLATE SELECTED]', {
      templateRecordId: this.selectedSmsTemplateRecordId,
      crmTemplateId: this.selectedSmsTemplate?.templateId,
      fast2smsMessageId: this.selectedSmsTemplate?.fast2smsMessageId || this.selectedSmsTemplate?.messageId || null,
      dltTemplateId: this.selectedSmsTemplate?.dltTemplateId || null,
      senderId: this.selectedSmsTemplate?.senderId || null,
      isActive: this.selectedSmsTemplate?.isActive ?? null,
      provider: this.selectedSmsTemplate?.provider || null,
      ready: isSmsTemplateReadyToSend(this.selectedSmsTemplate),
      issues: this.templateReadinessIssues,
      variableCount: this.templateVariableSlots.length,
    });
    this.logTemplatePreview();
  }

  onTemplateVariableChanged(index: number, value: string): void {
    this.templateVariables = {
      ...this.templateVariables,
      [index]: value,
    };
    console.log('[TEMPLATE VARIABLE INPUT UPDATED]', {
      source: 'single_sms',
      index,
      value,
    });
    this.logTemplatePreview();
  }

  isTemplateVariableMissing(index: number): boolean {
    return !String(this.templateVariables[index] || '').trim();
  }

  selectClient(client: SmsClient): void {
    this.selectedClient = client;
  }

  clearSelection(): void {
    this.selectedClient = null;
  }

  getClientInitials(client: SmsClient | null): string {
    const source = String(client?.name || client?.mobile || '').trim();
    if (!source) {
      return '--';
    }

    const words = source.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
  }

  trackByClientId(index: number, client: SmsClient): string {
    return client._id || client.mobile || String(index);
  }

  trackBySlotIndex(_: number, slot: SmsTemplateVariableSlot): number {
    return slot.index;
  }

  onSearchQueryChange(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      this.loadClients(this.searchQuery.trim());
    }, 350);
  }

  sendSms(): void {
    if (!this.canSend || !this.selectedClient) {
      return;
    }

    const phone = this.selectedClient.mobile;
    const variables = buildSmsVariablesArray(this.templateVariableSlots, this.templateVariables);

    console.log('[SINGLE SMS SEND REQUEST]', {
      phone,
      templateRecordId: this.selectedSmsTemplateRecordId,
      fast2smsMessageId: this.selectedSmsTemplate?.fast2smsMessageId || this.selectedSmsTemplate?.messageId,
      dltTemplateId: this.selectedSmsTemplate?.dltTemplateId,
      senderId: this.selectedSmsTemplate?.senderId,
    });

    this.isSending = true;
    const selected = this.selectedSmsTemplate;
    this.http
      .post<SmsSendResponse>('/api/sms/send-single', {
        phone,
        templateRecordId: this.selectedSmsTemplateRecordId,
        template: selected
          ? {
              _id: selected._id,
              messageId: selected.fast2smsMessageId || selected.messageId,
              senderId: selected.senderId,
              entityId: selected.entityId,
              templateContent: getSmsTemplateContent(selected),
              templateName: selected.templateName,
              templateId: selected.templateId,
            }
          : undefined,
        variables,
      })
      .pipe(
        finalize(() => {
          this.isSending = false;
        }),
      )
      .subscribe({
        next: (res) => {
          if (res && res.success === true) {
            this.toastr.success('DLT SMS sent successfully.');
            this.templateVariables = {};
            this.syncTemplateVariableMap();
            return;
          }

          const message = res?.message || 'Failed to send SMS.';
          this.toastr.error(message);
        },
        error: (err) => {
          const message = err?.error?.message || err?.message || 'Failed to send SMS.';
          this.toastr.error(message);
        },
      });
  }

  private syncTemplateVariableMap(): void {
    const nextMap: Record<number, string> = {};
    this.templateVariableSlots.forEach((slot) => {
      nextMap[slot.index] = this.templateVariables[slot.index] || '';
    });
    this.templateVariables = nextMap;
  }

  private logTemplatePreview(): void {
    if (!this.selectedSmsTemplate) {
      return;
    }
    console.log('[TEMPLATE PREVIEW GENERATED]', {
      source: 'single_sms',
      templateId: this.selectedSmsTemplate.templateId,
      preview: this.templatePreview,
    });
  }

  private focusFirstVariableInput(): void {
    const firstSlot = this.templateVariableSlots[0];
    if (!firstSlot) {
      return;
    }

    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`#single-sms-var-${firstSlot.index}`);
      input?.focus();
    }, 0);
  }

  private loadSmsTemplates(): void {
    this.isLoadingTemplates = true;
    this.smsTemplateService.getLiveTemplates().subscribe({
      next: (response) => {
        this.isLoadingTemplates = false;
        this.smsTemplates = response.success && Array.isArray(response.data) ? response.data : [];
        const readyCount = this.smsTemplates.filter((t) => isSmsTemplateReadyToSend(t)).length;
        console.log('[SINGLE SMS TEMPLATES LOADED]', {
          source: response.source || 'fast2sms',
          total: this.smsTemplates.length,
          readyToSend: readyCount,
          notReady: this.smsTemplates.length - readyCount,
        });
      },
      error: (err) => {
        this.isLoadingTemplates = false;
        this.smsTemplates = [];
        console.log('[SINGLE SMS TEMPLATES LOAD ERROR]', {
          message: err?.error?.message || err?.message || 'Failed to load templates',
        });
      },
    });
  }

  private loadClients(search = ''): void {
    const requestId = ++this.searchRequestId;
    const previousCount = this.clients.length;
    const normalizedSearch = search.trim();

    if (normalizedSearch) {
      console.log('[SMS SEARCH REQUEST]', {
        search: normalizedSearch,
        previousCount,
      });
    }

    this.isLoadingClients = true;
    this.clientService
      .getClients({ search: normalizedSearch || undefined, page: 1, limit: 100, sort: 'desc' })
      .pipe(
        catchError(() =>
          of({
            success: true,
            data: normalizedSearch ? [] : this.getMockClients(),
            pagination: { total: 0, page: 1, limit: 100, totalPages: 1 },
          }),
        ),
      )
      .subscribe((response) => {
        if (requestId !== this.searchRequestId) {
          return;
        }

        this.isLoadingClients = false;
        const items = response?.success && Array.isArray(response.data) ? response.data : [];
        this.clients = items.map((client) => ({
          _id: client._id,
          name: client.name,
          mobile: client.mobile,
        }));

        if (normalizedSearch) {
          console.log('[SMS SEARCH RESPONSE]', {
            search: normalizedSearch,
            resultCount: this.clients.length,
          });
        }
      });
  }

  private getMockClients(): SmsClient[] {
    return [
      { _id: 'mock-1', name: 'Ajith Kumar', mobile: '+91 98765 43210' },
      { _id: 'mock-2', name: 'Vichu', mobile: '+91 96374 382176' },
      { _id: 'mock-3', name: 'Priya', mobile: '+91 91234 56789' },
      { _id: 'mock-4', name: 'Ramesh', mobile: '+91 99887 76655' },
    ];
  }
}
