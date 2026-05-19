import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { catchError, finalize, of } from 'rxjs';
import { Client, ClientService } from '../manage-client/client.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

type SmsClient = Pick<Client, '_id' | 'name' | 'mobile'>;
type SmsSendResponse =
  | { success: true; phone: string; providerResponse?: unknown }
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
  message = '';
  isSending = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;

  constructor(
    private readonly clientService: ClientService,
    private readonly http: HttpClient,
    private readonly toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadClients();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  get characterCount(): number {
    return this.message.length;
  }

  get smsSegments(): number {
    const len = this.characterCount;
    if (len <= 0) {
      return 0;
    }
    if (len <= 160) {
      return 1;
    }
    return Math.ceil(len / 160);
  }

  get canSend(): boolean {
    return !!this.selectedClient && !!this.message.trim() && !this.isSending;
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

  onSearchQueryChange(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      this.loadClients(this.searchQuery.trim());
    }, 350);
  }

  sendSms(): void {
    if (!this.canSend) {
      return;
    }

    const phone = this.selectedClient?.mobile;
    const cleanMessage = String(this.message || '').trim();
    if (!phone || !cleanMessage) {
      return;
    }

    this.isSending = true;
    this.http
      .post<SmsSendResponse>('/api/sms/send', { phone, message: cleanMessage })
      .pipe(
        finalize(() => {
          this.isSending = false;
        })
      )
      .subscribe({
        next: (res) => {
          if (res && (res as any).success === true) {
            this.toastr.success('SMS sent successfully.');
            this.message = '';
            return;
          }

          const message = (res as any)?.message || 'Failed to send SMS.';
          this.toastr.error(message);
        },
        error: (err) => {
          const message = err?.error?.message || err?.message || 'Failed to send SMS.';
          this.toastr.error(message);
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
          })
        )
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

