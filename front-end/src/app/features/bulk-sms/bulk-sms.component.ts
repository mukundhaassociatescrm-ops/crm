import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Group } from '../manage-group/group.service';
import { BulkMessageService, SendBulkMessagePayload } from '../manage-bulk-message/bulk-message.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { GroupSelectorComponent } from '../../shared/components/group-selector/group-selector.component';

@Component({
  selector: 'app-bulk-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent, GroupSelectorComponent],
  templateUrl: './bulk-sms.component.html',
  styleUrl: './bulk-sms.component.scss',
})
export class BulkSmsComponent {
  selectedGroup: Group | null = null;
  message = '';
  isSending = false;

  constructor(
    private readonly bulkMessageService: BulkMessageService,
    private readonly toastr: ToastrService,
  ) {}

  get selectedGroupMemberCount(): number {
    if (!this.selectedGroup) {
      return 0;
    }

    return this.selectedGroup.memberCount ?? this.selectedGroup.actualClientCount ?? this.selectedGroup.numbers?.length ?? this.selectedGroup.contacts?.length ?? 0;
  }

  get characterCount(): number {
    return this.message.length;
  }

  get smsSegments(): number {
    if (this.characterCount <= 0) {
      return 0;
    }
    if (this.characterCount <= 160) {
      return 1;
    }
    return Math.ceil(this.characterCount / 160);
  }

  get canSend(): boolean {
    return !!this.selectedGroup?._id && !!this.message.trim() && !this.isSending;
  }

  onGroupSelected(group: Group | null): void {
    this.selectedGroup = group;
  }

  sendBulkSms(): void {
    if (!this.canSend || !this.selectedGroup?._id) {
      return;
    }

    const payload: SendBulkMessagePayload = {
      groupId: this.selectedGroup._id,
      message: this.message.trim(),
      channel: 'sms',
    };

    console.log('[BULK SMS SEND]', {
      groupId: payload.groupId,
      recipientCount: this.selectedGroupMemberCount,
      characterCount: this.characterCount,
      segments: this.smsSegments,
    });

    this.isSending = true;
    this.bulkMessageService.sendBulkMessage(payload).subscribe({
      next: (response) => {
        this.isSending = false;
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to send bulk SMS', 'Error');
          return;
        }

        this.toastr.success(`${response.sentCount} recipient(s) queued via Fast2SMS`, 'Bulk SMS Sent');
        this.message = '';
      },
      error: (error) => {
        this.isSending = false;
        this.toastr.error(error?.error?.message || 'Failed to send bulk SMS', 'Error');
      },
    });
  }
}
