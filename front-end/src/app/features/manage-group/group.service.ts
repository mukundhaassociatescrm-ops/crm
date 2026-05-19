import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface GroupContact {
  name?: string;
  phone: string;
}

export interface GroupClient {
  _id?: string;
  name: string;
  mobile: string;
  notes?: string;
}

export interface Group {
  _id?: string;
  name: string;
  contacts: GroupContact[];
  clients?: (string | GroupClient)[]; // Can be IDs or populated client objects
  numbers?: string[]; // For UI compatibility
  memberCount?: number;
  contactCount?: number;
  clientCount?: number;
  actualClientCount?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: {
    _id?: string;
    name?: string;
    email?: string;
  };
}

export interface GroupResponse {
  success: boolean;
  data: Group | Group[] | null;
  message?: string;
}

export interface GroupMember {
  id: string;
  type: 'client' | 'contact';
  name: string;
  phone: string;
  alternateMobile?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupMembersResponse {
  success: boolean;
  data: GroupMember[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats?: {
    memberCount: number;
    contactCount: number;
    clientCount: number;
  };
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class GroupService {
  constructor(private http: HttpClient) {}

  getGroups(search = ''): Observable<GroupResponse> {
    let params = new HttpParams();
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<GroupResponse>('/api/groups', { params });
  }

  getGroupById(id: string): Observable<GroupResponse> {
    return this.http.get<GroupResponse>(`/api/groups/${id}`);
  }

  createGroup(group: { name: string; contacts?: GroupContact[]; clients?: string[] }): Observable<GroupResponse> {
    return this.http.post<GroupResponse>('/api/groups', group);
  }

  updateGroup(id: string, group: { name?: string; contacts?: GroupContact[]; clients?: string[] }): Observable<GroupResponse> {
    return this.http.put<GroupResponse>(`/api/groups/${id}`, group);
  }

  deleteGroup(id: string): Observable<GroupResponse> {
    return this.http.delete<GroupResponse>(`/api/groups/${id}`);
  }

  assignClientsToGroup(groupId: string, clientIds: string[]): Observable<GroupResponse> {
    return this.http.post<GroupResponse>(`/api/groups/${groupId}/assign-clients`, { clientIds });
  }

  getGroupMembers(groupId: string, params: { search?: string; page?: number; limit?: number } = {}): Observable<GroupMembersResponse> {
    let httpParams = new HttpParams();
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.limit) httpParams = httpParams.set('limit', String(params.limit));
    return this.http.get<GroupMembersResponse>(`/api/groups/${groupId}/members`, { params: httpParams });
  }

  addClientsToGroup(groupId: string, clientIds: string[]): Observable<GroupResponse> {
    return this.http.post<GroupResponse>(`/api/groups/${groupId}/clients`, { clientIds });
  }

  removeClientFromGroup(groupId: string, clientId: string): Observable<GroupResponse> {
    return this.http.delete<GroupResponse>(`/api/groups/${groupId}/clients/${clientId}`);
  }
}
