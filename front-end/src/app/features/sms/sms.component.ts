import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { Client, ClientService } from '../manage-client/client.service';

type SmsClient = Pick<Client, '_id' | 'name' | 'mobile'>;

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

  constructor(private readonly clientService: ClientService) {}

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
    return !!this.selectedClient && !!this.message.trim();
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

    // Backend integration will be added later.
    console.log('[SMS] queued', {
      to: this.selectedClient?.mobile,
      name: this.selectedClient?.name,
      message: this.message,
      length: this.characterCount,
      segments: this.smsSegments,
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

