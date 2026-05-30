import { Injectable } from '@angular/core';
import { BehaviorSubject, catchError, forkJoin, map, of } from 'rxjs';
import { ChatService } from '../../features/manage-chat/manage-chat/chat.service';
import { ClientService } from '../../features/manage-client/client.service';
import { PosterService } from '../../features/manage-posters/poster.service';

export interface DashboardHubBadges {
  communicationUnread: number;
  clientCount: number;
  posterCount: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardStatsService {
  private readonly badgesSubject = new BehaviorSubject<DashboardHubBadges>({
    communicationUnread: 0,
    clientCount: 0,
    posterCount: 0,
  });

  readonly badges$ = this.badgesSubject.asObservable();

  constructor(
    private readonly chatService: ChatService,
    private readonly clientService: ClientService,
    private readonly posterService: PosterService,
  ) {}

  refresh(): void {
    forkJoin({
      conversations: this.chatService.getConversations().pipe(
        map((response) => {
          const rows = response?.data || [];
          return rows.reduce((sum, row) => sum + Math.max(0, Number(row.unreadCount) || 0), 0);
        }),
        catchError(() => of(0)),
      ),
      clients: this.clientService.getClients({ page: 1, limit: 1 }).pipe(
        map((response) => Number(response?.pagination?.total) || 0),
        catchError(() => of(0)),
      ),
      posters: this.posterService.list({ page: 1, limit: 1 }).pipe(
        map((response) => Number(response?.pagination?.total) || (response?.data?.length ?? 0)),
        catchError(() => of(0)),
      ),
    }).subscribe(({ conversations, clients, posters }) => {
      this.badgesSubject.next({
        communicationUnread: conversations,
        clientCount: clients,
        posterCount: posters,
      });
    });
  }

  get snapshot(): DashboardHubBadges {
    return this.badgesSubject.value;
  }
}
