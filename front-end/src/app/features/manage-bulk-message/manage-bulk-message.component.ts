import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Group } from '../manage-group/group.service';
import { ToastrService } from 'ngx-toastr';
import { ChatService, WhatsAppTemplateOption } from '../manage-chat/manage-chat/chat.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { GroupSelectorComponent } from '../../shared/components/group-selector/group-selector.component';
import { CreateCampaignPayload, WhatsappCampaignService } from './whatsapp-campaign.service';

@Component({
  selector: 'app-manage-bulk-message',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent, GroupSelectorComponent, RouterLink],
  templateUrl: './manage-bulk-message.component.html',
  styleUrl: './manage-bulk-message.component.scss',
})
export class ManageBulkMessageComponent implements OnInit, OnDestroy {
  /** Re-enable when media-header templates are supported in the UI. */
  readonly showMediaAttachment = false;

  selectedGroup: Group | null = null;
  isSending = false;

  bulkWhatsAppTemplates: WhatsAppTemplateOption[] = [];
  selectedBulkTemplateId = '';
  bulkTemplateVariables: Record<number, string> = {};
  isLoadingBulkTemplates = false;
  campaignLabel = '';
  selectedMediaFile: File | null = null;
  isUploadingMedia = false;
  uploadProgress = 0;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly toastr: ToastrService,
    private readonly chatService: ChatService,
    private readonly campaignService: WhatsappCampaignService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.loadBulkWhatsAppTemplates();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedBulkTemplate(): WhatsAppTemplateOption | null {
    return this.bulkWhatsAppTemplates.find((t) => t.id === this.selectedBulkTemplateId) || null;
  }

  get bulkTemplateVariableIndexes(): number[] {
    const variables = this.selectedBulkTemplate?.variables;
    if (!Array.isArray(variables)) {
      return [];
    }
    return [...variables].sort((a, b) => a - b);
  }

  get selectedGroupMemberCount(): number {
    if (!this.selectedGroup) {
      return 0;
    }
    return (
      this.selectedGroup.memberCount
      ?? this.selectedGroup.actualClientCount
      ?? this.selectedGroup.numbers?.length
      ?? this.selectedGroup.contacts?.length
      ?? 0
    );
  }

  get renderedTemplatePreview(): string {
    const template = this.selectedBulkTemplate;
    if (!template) {
      return 'Your message will appear here once you select a template.';
    }
    const body = String(template.body || template.name || '').trim();
    if (!body) {
      return template.name || 'Preview unavailable.';
    }
    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => {
      const key = Number(index);
      const value = String(this.bulkTemplateVariables[key] || '').trim();
      return value || `{{${key}}}`;
    });
  }

  get templateCategoryLabel(): string {
    const raw = String(this.selectedBulkTemplate?.category || '').trim();
    if (!raw) {
      return '—';
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  get templateLanguageLabel(): string {
    const code = String(this.selectedBulkTemplate?.language || '').trim();
    if (!code) {
      return '—';
    }
    try {
      const display = new Intl.DisplayNames(['en'], { type: 'language' }).of(code.split('_')[0]);
      if (display) {
        return display;
      }
    } catch {
      // ignore
    }
    return code.toUpperCase();
  }

  get templateVariableCount(): number {
    return this.bulkTemplateVariableIndexes.length;
  }

  get previewTimeLabel(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  get canSend(): boolean {
    if (!this.selectedGroup || this.isSending || (this.showMediaAttachment && this.isUploadingMedia)) {
      return false;
    }
    if (!this.selectedBulkTemplateId || this.isLoadingBulkTemplates) {
      return false;
    }
    const indexes = this.bulkTemplateVariableIndexes;
    if (indexes.length === 0) {
      return true;
    }
    return indexes.every((index) => String(this.bulkTemplateVariables[index] || '').trim().length > 0);
  }

  onGroupSelected(group: Group | null): void {
    this.selectedGroup = group;
  }

  onBulkTemplateIdChanged(): void {
    const indexes = this.bulkTemplateVariableIndexes;
    const nextMap: Record<number, string> = {};
    indexes.forEach((index) => {
      nextMap[index] = this.bulkTemplateVariables[index] || '';
    });
    this.bulkTemplateVariables = nextMap;
  }

  onBulkTemplateVariableChanged(index: number, value: string): void {
    this.bulkTemplateVariables = { ...this.bulkTemplateVariables, [index]: value };
  }

  onMediaSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] || null;
    if (file) {
      this.selectedMediaFile = file;
    }
  }

  removeSelectedMedia(): void {
    this.selectedMediaFile = null;
    this.uploadProgress = 0;
  }

  sendCampaign(): void {
    if (!this.canSend) {
      return;
    }
    if (this.selectedMediaFile) {
      this.uploadAndLaunch(this.selectedMediaFile);
      return;
    }
    this.launchCampaign();
  }

  private loadBulkWhatsAppTemplates(): void {
    this.isLoadingBulkTemplates = true;
    this.chatService.getTemplates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.isLoadingBulkTemplates = false;
        this.bulkWhatsAppTemplates = Array.isArray(response?.data) ? response.data : [];
      },
      error: () => {
        this.isLoadingBulkTemplates = false;
        this.toastr.error('Failed to load WhatsApp templates', 'Error');
      },
    });
  }

  private uploadAndLaunch(file: File): void {
    this.isSending = true;
    this.isUploadingMedia = true;
    this.chatService.uploadFile(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: (uploadEvent) => {
        if (!uploadEvent.done) {
          this.uploadProgress = uploadEvent.progress;
          return;
        }
        this.isUploadingMedia = false;
        this.launchCampaign({
          attachmentUrl: uploadEvent.data?.url || '',
          attachmentFilename: uploadEvent.data?.filename || file.name,
          attachmentMimeType: uploadEvent.data?.mimeType || file.type,
        });
      },
      error: (error) => {
        this.isSending = false;
        this.isUploadingMedia = false;
        this.toastr.error(error?.error?.message || 'Media upload failed', 'Error');
      },
    });
  }

  private launchCampaign(media: Partial<CreateCampaignPayload> = {}): void {
    if (!this.selectedGroup?._id) {
      return;
    }

    const template = this.selectedBulkTemplate;
    const params = this.bulkTemplateVariableIndexes.map((i) => String(this.bulkTemplateVariables[i] || '').trim());

    const payload: CreateCampaignPayload = {
      groupId: this.selectedGroup._id,
      label: this.campaignLabel.trim(),
      templateId: this.selectedBulkTemplateId,
      templateName: template?.name || '',
      templateBody: template?.body || '',
      params,
      ...media,
    };

    this.isSending = true;
    this.campaignService.createCampaign(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.isSending = false;
        const id = res.data?.campaign?.id;
        this.toastr.success('Campaign started. Track progress in Campaign Tracking.', 'Campaign');
        this.campaignLabel = '';
        this.removeSelectedMedia();
        if (id) {
          this.router.navigate(['/whatsapp-campaign-tracking', id]);
        } else {
          this.router.navigate(['/whatsapp-campaign-tracking']);
        }
      },
      error: (error) => {
        this.isSending = false;
        this.toastr.error(error?.error?.message || 'Failed to start campaign', 'Error');
      },
    });
  }
}
