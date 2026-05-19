import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Group, GroupService } from '../manage-group/group.service';
import { ToastrService } from 'ngx-toastr';
import { BulkMessageService, MessageChannel, SendBulkMessagePayload } from './bulk-message.service';
import { ChatService, WhatsAppTemplateOption } from '../manage-chat/manage-chat/chat.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

@Component({
  selector: 'app-manage-bulk-message',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-bulk-message.component.html',
  styleUrl: './manage-bulk-message.component.scss'
})
export class ManageBulkMessageComponent implements OnInit {
  groups: Group[] = [];
  selectedGroup: Group | null = null;
  messageText = '';
  selectedChannel: MessageChannel = 'sms';
  isLoadingGroups = false;
  isSending = false;

  bulkWhatsAppTemplates: WhatsAppTemplateOption[] = [];
  selectedBulkTemplateId = '';
  bulkTemplateVariables: Record<number, string> = {};
  isLoadingBulkTemplates = false;

  constructor(
    private readonly groupService: GroupService,
    private readonly toastr: ToastrService,
    private readonly bulkMessageService: BulkMessageService,
    private readonly chatService: ChatService,
  ) {}

  ngOnInit(): void {
    this.loadGroups();
  }

  get hasGroups(): boolean {
    return this.groups.length > 0;
  }

  get selectedGroupMemberCount(): number {
    if (!this.selectedGroup) {
      return 0;
    }

    return this.selectedGroup.numbers?.length || this.selectedGroup.contacts?.length || 0;
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
    if (!this.selectedGroup || this.isSending) {
      return false;
    }
    if (this.selectedChannel === 'sms') {
      return !!this.messageText.trim();
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

  loadGroups(): void {
    this.isLoadingGroups = true;
    this.groupService.getGroups().subscribe({
      next: (response) => {
        this.isLoadingGroups = false;
        if (!response.success || !response.data) {
          this.groups = [];
          return;
        }

        const groups = Array.isArray(response.data) ? response.data : [response.data];
        this.groups = groups.map((group) => ({
          ...group,
          numbers: group.numbers || group.contacts.map((contact) => contact.phone)
        }));
      },
      error: () => {
        this.isLoadingGroups = false;
        this.groups = [];
        this.toastr.error('Failed to load groups', 'Error');
      }
    });
  }

  onGroupChange(): void {
    // No-op, retained for template select change binding.
  }

  onMessageChannelChange(): void {
    if (this.selectedChannel === 'whatsapp') {
      this.loadBulkWhatsAppTemplates();
    } else {
      this.selectedBulkTemplateId = '';
      this.bulkTemplateVariables = {};
    }
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
    this.chatService.getTemplates().subscribe({
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

  sendBulkMessage(): void {
    if (!this.canSend || this.isSending) {
      return;
    }

    if (!this.selectedGroup?._id) {
      this.toastr.error('Please select a valid group', 'Validation');
      return;
    }

    const base: SendBulkMessagePayload = {
      groupId: this.selectedGroup._id,
      message: this.messageText.trim(),
      channel: this.selectedChannel,
    };

    if (this.selectedChannel === 'whatsapp') {
      const indexes = this.bulkTemplateVariableIndexes;
      const params = indexes.map((index) => String(this.bulkTemplateVariables[index] || '').trim());
      base.templateId = this.selectedBulkTemplateId;
      base.params = params;
      base.expectedParamCount = indexes.length;
      if (!base.message) {
        base.message = `Template ${this.selectedBulkTemplate?.name || this.selectedBulkTemplateId}`;
      }
    }

    this.isSending = true;
    this.bulkMessageService.sendBulkMessage(base).subscribe({
      next: (response) => {
        this.isSending = false;
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to send message', 'Error');
          return;
        }

        this.toastr.success(
          `${response.sentCount} recipient(s) queued via ${this.selectedChannel.toUpperCase()}`,
          'Bulk Message Sent'
        );
      },
      error: (error) => {
        this.isSending = false;
        this.toastr.error(error?.error?.message || 'Failed to send bulk message', 'Error');
      }
    });
  }
}
