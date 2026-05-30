import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type CampaignStats = {
  total: number;
  delivered: number;
  queued: number;
  sending: number;
  failed: number;
  read: number;
  skipped?: number;
  sessionSent?: number;
  waitingDailyLimit?: number;
};

export type CampaignSummary = {
  id: string;
  name: string;
  label: string;
  groupName: string;
  templateId: string;
  templateName: string;
  status: string;
  stats: CampaignStats;
  startedAt?: string;
  createdAt?: string;
};

export type CampaignRecipient = {
  id: string;
  customerName: string;
  phone: string;
  status: string;
  reason: string;
  failureReason: string;
  scheduledAt?: string;
  deliveredAt?: string;
  sentAt?: string;
  readAt?: string;
};

export type CreateCampaignPayload = {
  groupId: string;
  label?: string;
  templateId: string;
  templateName?: string;
  templateBody?: string;
  params?: string[];
  attachmentUrl?: string;
  posterId?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
};

export type CampaignListResult = {
  campaigns: CampaignSummary[];
  total: number;
  limit: number;
  skip: number;
};

@Injectable({ providedIn: 'root' })
export class WhatsappCampaignService {
  private readonly baseUrl = '/api/whatsapp-campaigns';

  constructor(private readonly http: HttpClient) {}

  createCampaign(payload: CreateCampaignPayload): Observable<{ success: boolean; data: { campaign: CampaignSummary } }> {
    return this.http.post<{ success: boolean; data: { campaign: CampaignSummary } }>(this.baseUrl, payload);
  }

  listCampaigns(opts: {
    limit?: number;
    skip?: number;
    search?: string;
    status?: string;
  } = {}): Observable<{ success: boolean; data: CampaignListResult }> {
    let params = new HttpParams()
      .set('limit', String(opts.limit ?? 30))
      .set('skip', String(opts.skip ?? 0));
    if (opts.search) {
      params = params.set('search', opts.search);
    }
    if (opts.status) {
      params = params.set('status', opts.status);
    }
    return this.http.get<{ success: boolean; data: CampaignListResult }>(this.baseUrl, { params });
  }

  getCampaign(id: string): Observable<{ success: boolean; data: { campaign: CampaignSummary; queue: Record<string, number>; usage: { limit: number; used: number; remaining: number } } }> {
    return this.http.get<{ success: boolean; data: { campaign: CampaignSummary; queue: Record<string, number>; usage: { limit: number; used: number; remaining: number } } }>(`${this.baseUrl}/${id}`);
  }

  getRecipients(
    id: string,
    opts: { status?: string; search?: string; limit?: number; skip?: number } = {},
  ): Observable<{ success: boolean; data: { recipients: CampaignRecipient[]; total: number } }> {
    let params = new HttpParams()
      .set('limit', String(opts.limit ?? 100))
      .set('skip', String(opts.skip ?? 0));
    if (opts.status) {
      params = params.set('status', opts.status);
    }
    if (opts.search) {
      params = params.set('search', opts.search);
    }
    return this.http.get<{ success: boolean; data: { recipients: CampaignRecipient[]; total: number } }>(
      `${this.baseUrl}/${id}/recipients`,
      { params },
    );
  }

  pauseCampaign(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${id}/pause`, {});
  }

  resumeCampaign(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${id}/resume`, {});
  }

  retryFailed(id: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.baseUrl}/${id}/retry-failed`, {});
  }
}
