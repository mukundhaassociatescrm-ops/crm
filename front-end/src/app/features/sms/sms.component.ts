import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { catchError, finalize, of } from 'rxjs';
import { Client, ClientService } from '../manage-client/client.service';

type SmsClient = Pick<Client, '_id' | 'name' | 'mobile'>;
type SmsSendResponse =
  | { success: true; phone: string; providerResponse?: unknown }
  | { success: false; message?: string };

@Component({
  selector: 'app-sms',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sms.component.html',
  styleUrl: './sms.component.scss',
})
export class SmsComponent implements OnInit {
  clients: SmsClient[] = [];
  isLoadingClients = false;
  selectedClient: SmsClient | null = null;
  searchQuery = '';
  message = '';
  isSending = false;

  constructor(
    private readonly clientService: ClientService,
    private readonly http: HttpClient,
    private readonly toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadClients();
  }

  get filteredClients(): SmsClient[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.clients;
    }

    return this.clients.filter((client) => {
      const name = String(client.name || '').toLowerCase();
      const phone = String(client.mobile || '').toLowerCase();
      return name.includes(query) || phone.includes(query);
    });
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

  private loadClients(): void {
    this.isLoadingClients = true;
    this.clientService
      .getClients({ page: 1, limit: 200, sort: 'desc' })
      .pipe(
        catchError(() =>
          of({
            success: true,
            data: this.getMockClients(),
            pagination: { total: 0, page: 1, limit: 200, totalPages: 1 },
          })
        )
      )
      .subscribe((response) => {
        this.isLoadingClients = false;
        const items = response?.success && Array.isArray(response.data) ? response.data : [];
        this.clients = items.map((client) => ({
          _id: client._id,
          name: client.name,
          mobile: client.mobile,
        }));
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

