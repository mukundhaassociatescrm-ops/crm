import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Client {
  _id?: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  whatsappOptIn: boolean;
  notes?: string;
  groups?: (string | { _id?: string; name: string })[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientListResponse {
  success: boolean;
  data: Client[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message?: string;
}

export interface ClientResponse {
  success: boolean;
  data: Client;
  message?: string;
}

export interface BulkUploadResponse {
  success: boolean;
  created: number;
  skipped: number;
  errors: { row: string; reason: string }[];
  message?: string;
  meta?: {
    fileType?: string;
    parser?: string;
    columnMap?: {
      nameColumn?: string | null;
      phoneColumn?: string | null;
      alternateMobileColumn?: string | null;
      groupColumn?: string | null;
    };
  };
  summary?: {
    totalRows: number;
    imported: number;
    duplicates: number;
    invalid: number;
    groupsCreated: number;
    groupAssignments: number;
    skipped: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ClientService {
  constructor(private http: HttpClient) {}

  getClients(params: { search?: string; page?: number; limit?: number; sort?: string } = {}): Observable<ClientListResponse> {
    let httpParams = new HttpParams();
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.limit) httpParams = httpParams.set('limit', String(params.limit));
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    return this.http.get<ClientListResponse>('/api/clients', { params: httpParams });
  }

  createClient(client: Omit<Client, '_id' | 'createdAt' | 'updatedAt'>): Observable<ClientResponse> {
    return this.http.post<ClientResponse>('/api/clients', client);
  }

  updateClient(id: string, client: Partial<Client>): Observable<ClientResponse> {
    return this.http.put<ClientResponse>(`/api/clients/${id}`, client);
  }

  deleteClient(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`/api/clients/${id}`);
  }

  bulkUpload(file: File): Observable<BulkUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<BulkUploadResponse>('/api/clients/bulk-upload', form);
  }

  getClientChats(id: string): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`/api/clients/${id}/chats`);
  }

  assignGroupsToClient(clientId: string, groupIds: string[]): Observable<ClientResponse> {
    return this.http.post<ClientResponse>(`/api/clients/${clientId}/assign-groups`, { groupIds });
  }
}
