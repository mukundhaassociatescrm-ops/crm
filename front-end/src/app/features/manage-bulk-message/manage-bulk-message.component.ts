import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Group } from '../manage-group/group.service';
import { ToastrService } from 'ngx-toastr';
import { BulkMessageService, SendBulkMessagePayload } from './bulk-message.service';
import { ChatService, WhatsAppTemplateOption } from '../manage-chat/manage-chat/chat.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { GroupSelectorComponent } from '../../shared/components/group-selector/group-selector.component';

@Component({
  selector: 'app-manage-bulk-message',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent, GroupSelectorComponent],
  templateUrl: './manage-bulk-message.component.html',
  styleUrl: './manage-bulk-message.component.scss'
})
export class ManageBulkMessageComponent implements OnInit, OnDestroy {
  selectedGroup: Group | null = null;
  isSending = false;

  bulkWhatsAppTemplates: WhatsAppTemplateOption[] = [];
  selectedBulkTemplateId = '';
  bulkTemplateVariables: Record<number, string> = {};
  isLoadingBulkTemplates = false;
  campaignLabel = '';
  selectedMediaFile: File | null = null;
  selectedMediaPreviewUrl = '';
  isUploadingMedia = false;
  uploadProgress = 0;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly toastr: ToastrService,
    private readonly bulkMessageService: BulkMessageService,
    private readonly chatService: ChatService,
  ) {}

  ngOnInit(): void {
    this.loadBulkWhatsAppTemplates();
  }

  ngOnDestroy(): void {
    this.revokeMediaPreview();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get selectedGroupMemberCount(): number {
    if (!this.selectedGroup) {
      return 0;
    }

    return this.selectedGroup.memberCount ?? this.selectedGroup.actualClientCount ?? this.selectedGroup.numbers?.length ?? this.selectedGroup.contacts?.length ?? 0;
  }

  get hasSelectedMedia(): boolean {
    return !!this.selectedMediaFile;
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

  getTemplateVariableCount(template: WhatsAppTemplateOption | null | undefined): number {
    const variables = template?.variables;
    if (!Array.isArray(variables)) {
      return 0;
    }
    return variables.length;
  }

  get canSend(): boolean {
    if (!this.selectedGroup || this.isSending || this.isUploadingMedia) {
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

  get renderedTemplatePreview(): string {
    const template = this.selectedBulkTemplate;
    if (!template) {
      return 'Select a WhatsApp template to preview the campaign message.';
    }

    const body = String(template.body || template.name || template.id || '').trim();
    if (!body) {
      return 'Template preview unavailable.';
    }

    return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => {
      const key = Number(index);
      const value = String(this.bulkTemplateVariables[key] || '').trim();
      return value || `{{${key}}}`;
    });
  }

  get mediaTypeLabel(): string {
    const mimeType = String(this.selectedMediaFile?.type || '').toLowerCase();
    if (mimeType.startsWith('image/')) {
      return 'Image header';
    }
    if (mimeType.startsWith('video/')) {
      return 'Video header';
    }
    if (mimeType.startsWith('audio/')) {
      return 'Audio attachment';
    }
    return this.selectedMediaFile ? 'Document attachment' : 'No media selected';
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
    this.bulkTemplateVariables = {
      ...this.bulkTemplateVariables,
      [index]: value,
    };
  }

  private loadBulkWhatsAppTemplates(): void {
    this.isLoadingBulkTemplates = true;
    this.selectedBulkTemplateId = '';
    this.bulkTemplateVariables = {};
    this.chatService.getTemplates().pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.isLoadingBulkTemplates = false;
        const templates = Array.isArray(response?.data) ? response.data : [];
        this.bulkWhatsAppTemplates = templates;
        if (!templates.length) {
          this.toastr.warning('No WhatsApp templates returned from the server.', 'Templates');
        }
      },
      error: () => {
        this.isLoadingBulkTemplates = false;
        this.bulkWhatsAppTemplates = [];
        this.toastr.error('Failed to load WhatsApp templates', 'Error');
      }
    });
  }

  onMediaSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) {
      return;
    }

    this.revokeMediaPreview();
    this.selectedMediaFile = file;
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      this.selectedMediaPreviewUrl = URL.createObjectURL(file);
    }
  }

  removeSelectedMedia(): void {
    this.revokeMediaPreview();
    this.selectedMediaFile = null;
    this.uploadProgress = 0;
  }

  sendBulkMessage(): void {
    if (!this.canSend || this.isSending) {
      return;
    }

    if (!this.selectedGroup?._id) {
      this.toastr.error('Please select a valid group', 'Validation');
      return;
    }

    if (this.selectedMediaFile) {
      this.uploadAndSendCampaign(this.selectedMediaFile);
      return;
    }

    this.sendCampaign();
  }

  private uploadAndSendCampaign(file: File): void {
    this.isSending = true;
    this.isUploadingMedia = true;
    this.uploadProgress = 0;

    this.chatService.uploadFile(file).pipe(takeUntil(this.destroy$)).subscribe({
      next: (uploadEvent) => {
        if (!uploadEvent.done) {
          this.uploadProgress = uploadEvent.progress;
          return;
        }

        this.isUploadingMedia = false;
        this.sendCampaign({
          attachmentUrl: uploadEvent.data?.url || '',
          attachmentFilename: uploadEvent.data?.filename || file.name,
          attachmentMimeType: uploadEvent.data?.mimeType || file.type,
        });
      },
      error: (error) => {
        this.isSending = false;
        this.isUploadingMedia = false;
        this.toastr.error(error?.error?.message || 'Failed to upload campaign media', 'Error');
      },
    });
  }

  private sendCampaign(mediaPatch: Partial<SendBulkMessagePayload> = {}): void {
    if (!this.selectedGroup?._id) {
      return;
    }

    const indexes = this.bulkTemplateVariableIndexes;
    const params = indexes.map((index) => String(this.bulkTemplateVariables[index] || '').trim());
    const payload: SendBulkMessagePayload = {
      groupId: this.selectedGroup._id,
      message: this.campaignLabel.trim() || `WhatsApp campaign: ${this.selectedBulkTemplate?.name || this.selectedBulkTemplateId}`,
      channel: 'whatsapp',
      templateId: this.selectedBulkTemplateId,
      params,
      expectedParamCount: indexes.length,
      ...mediaPatch,
    };

    console.log('[WHATSAPP CAMPAIGN SEND]', {
      groupId: payload.groupId,
      templateId: payload.templateId,
      recipientCount: this.selectedGroupMemberCount,
      variableCount: params.length,
      hasMedia: Boolean(payload.attachmentUrl || this.selectedMediaFile),
    });

    this.isSending = true;
    this.bulkMessageService.sendBulkMessage(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        this.isSending = false;
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to send message', 'Error');
          return;
        }

        this.toastr.success(
          `${response.sentCount} recipient(s) queued via WhatsApp template`,
          'WhatsApp Campaign Sent'
        );
        this.campaignLabel = '';
        this.removeSelectedMedia();
      },
      error: (error) => {
        this.isSending = false;
        this.toastr.error(error?.error?.message || 'Failed to send WhatsApp campaign', 'Error');
      }
    });
  }

  private revokeMediaPreview(): void {
    if (this.selectedMediaPreviewUrl) {
      URL.revokeObjectURL(this.selectedMediaPreviewUrl);
      this.selectedMediaPreviewUrl = '';
    }
  }
}
