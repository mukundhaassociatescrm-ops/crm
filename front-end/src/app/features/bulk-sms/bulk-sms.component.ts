import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { Group } from '../manage-group/group.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { SmsWalletBalanceComponent } from '../../shared/components/sms-wallet-balance/sms-wallet-balance.component';
import { GroupSelectorComponent } from '../../shared/components/group-selector/group-selector.component';
import {
  buildSmsVariablesArray,
  renderSmsTemplatePreview,
  resolveSmsTemplateVariableSlots,
  SmsTemplateVariableSlot,
} from '../manage-sms-templates/sms-template-variable.utils';
import {
  getBulkDltMessageParam as resolveBulkDltMessageParam,
  getSmsTemplateContent,
  getSmsTemplateReadinessIssues,
  isSmsTemplateReadyForBulkDlt,
  SmsTemplate,
  SmsTemplateService,
} from '../manage-sms-templates/sms-template.service';
import { Poster, PosterService } from '../manage-posters/poster.service';

@Component({
  selector: 'app-bulk-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent, GroupSelectorComponent, SmsWalletBalanceComponent],
  templateUrl: './bulk-sms.component.html',
  styleUrl: './bulk-sms.component.scss',
})
export class BulkSmsComponent {
  selectedGroup: Group | null = null;
  isSending = false;
  smsTemplates: SmsTemplate[] = [];
  selectedSmsTemplateRecordId = '';
  templateVariables: Record<number, string> = {};
  isLoadingTemplates = false;
  posters: Poster[] = [];
  selectedPosterId = '';
  isLoadingPosters = false;

  constructor(
    private readonly toastr: ToastrService,
    private readonly smsTemplateService: SmsTemplateService,
    private readonly posterService: PosterService,
  ) {
    this.loadSmsTemplates();
    this.loadPosters();
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

  get selectedPoster(): Poster | null {
    return this.posters.find((item) => item._id === this.selectedPosterId) || null;
  }

  get posterLandingUrl(): string {
    const poster = this.selectedPoster;
    if (!poster) {
      return '';
    }
    return poster.landingUrl || this.posterService.buildLandingUrl(poster.slug);
  }

  get templatePreview(): string {
    if (!this.selectedSmsTemplate) {
      return 'Select a DLT template to preview the message.';
    }
    const base = renderSmsTemplatePreview(
      getSmsTemplateContent(this.selectedSmsTemplate),
      this.templateVariables,
    );
    if (!this.posterLandingUrl) {
      return base;
    }
    return `${base}\n\n${this.posterLandingUrl}`;
  }

  get templateReadinessIssues(): string[] {
    if (!this.selectedSmsTemplateRecordId) {
      return [];
    }
    const issues = getSmsTemplateReadinessIssues(this.selectedSmsTemplate);
    if (this.selectedSmsTemplate && !resolveBulkDltMessageParam(this.selectedSmsTemplate)) {
      issues.push('Missing DLT template ID for bulk send');
    }
    return issues;
  }

  get selectedGroupMemberCount(): number {
    if (!this.selectedGroup) {
      return 0;
    }

    return this.selectedGroup.memberCount ?? this.selectedGroup.actualClientCount ?? this.selectedGroup.numbers?.length ?? this.selectedGroup.contacts?.length ?? 0;
  }

  get canSend(): boolean {
    if (!this.selectedGroup?._id || !this.selectedSmsTemplateRecordId || this.isSending) {
      return false;
    }

    if (!isSmsTemplateReadyForBulkDlt(this.selectedSmsTemplate)) {
      return false;
    }

    const slots = this.templateVariableSlots;
    if (!slots.length) {
      return true;
    }

    return slots.every((slot) => String(this.templateVariables[slot.index] || '').trim().length > 0);
  }

  onGroupSelected(group: Group | null): void {
    this.selectedGroup = group;
  }

  onPosterChanged(): void {
    this.applyPosterUrlToVariables();
  }

  onSmsTemplateChanged(): void {
    this.syncTemplateVariableMap();
    this.applyPosterUrlToVariables();
    console.log('[BULK SMS TEMPLATE SELECTED]', {
      templateRecordId: this.selectedSmsTemplateRecordId,
      dltMessage: resolveBulkDltMessageParam(this.selectedSmsTemplate),
      senderId: this.selectedSmsTemplate?.senderId,
      variableCount: this.templateVariableSlots.length,
    });
  }

  onTemplateVariableChanged(index: number, value: string): void {
    this.templateVariables = {
      ...this.templateVariables,
      [index]: value,
    };
  }

  isTemplateVariableMissing(index: number): boolean {
    return !String(this.templateVariables[index] || '').trim();
  }

  trackBySlotIndex(_: number, slot: SmsTemplateVariableSlot): number {
    return slot.index;
  }

  bulkDltMessageId(template: SmsTemplate | null): string {
    return resolveBulkDltMessageParam(template);
  }

  sendBulkSms(): void {
    if (!this.canSend || !this.selectedGroup?._id || !this.selectedSmsTemplate) {
      return;
    }

    const variables = buildSmsVariablesArray(this.templateVariableSlots, this.templateVariables);
    const selected = this.selectedSmsTemplate;

    console.log('[BULK SMS SEND REQUEST]', {
      groupId: this.selectedGroup._id,
      recipientCount: this.selectedGroupMemberCount,
      dltMessage: resolveBulkDltMessageParam(selected),
      senderId: selected.senderId,
      variables,
    });

    this.isSending = true;
    this.smsTemplateService
      .sendBulkDlt({
        groupId: this.selectedGroup._id,
        template: {
          _id: selected._id,
          messageId: selected.fast2smsMessageId || selected.messageId,
          senderId: selected.senderId,
          entityId: selected.entityId,
          templateContent: getSmsTemplateContent(selected),
          templateName: selected.templateName,
          templateId: selected.templateId,
          dltTemplateId: selected.dltTemplateId,
          contentTemplateId: selected.contentTemplateId,
        },
        variables,
      })
      .pipe(finalize(() => {
        this.isSending = false;
      }))
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toastr.error(response.message || 'Failed to send bulk SMS', 'Error');
            return;
          }

          this.toastr.success(
            `${response.sentCount ?? this.selectedGroupMemberCount} recipient(s) sent via Fast2SMS DLT`,
            'Bulk SMS Sent',
          );
          this.templateVariables = {};
          this.syncTemplateVariableMap();
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to send bulk SMS', 'Error');
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

  private applyPosterUrlToVariables(): void {
    if (!this.posterLandingUrl) {
      return;
    }

    const slots = this.templateVariableSlots;
    if (!slots.length) {
      return;
    }

    const targetSlot = slots[slots.length - 1];
    this.templateVariables = {
      ...this.templateVariables,
      [targetSlot.index]: this.posterLandingUrl,
    };
  }

  private loadPosters(): void {
    this.isLoadingPosters = true;
    this.posterService.listActive().subscribe({
      next: (res) => {
        this.isLoadingPosters = false;
        this.posters = res.success ? res.data || [] : [];
      },
      error: () => {
        this.isLoadingPosters = false;
        this.posters = [];
      },
    });
  }

  private loadSmsTemplates(): void {
    this.isLoadingTemplates = true;
    this.smsTemplateService.getLiveTemplates().subscribe({
      next: (response) => {
        this.isLoadingTemplates = false;
        this.smsTemplates = response.success && Array.isArray(response.data) ? response.data : [];
        console.log('[BULK SMS TEMPLATES LOADED]', {
          source: response.source || 'fast2sms',
          total: this.smsTemplates.length,
        });
      },
      error: () => {
        this.isLoadingTemplates = false;
        this.smsTemplates = [];
      },
    });
  }
}
