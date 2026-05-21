import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export function getSmsTemplateMessageId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId'> | null | undefined,
): string {
  return String(template?.messageId || template?.dltMessageId || '').trim();
}

export function hasSmsTemplateMessageId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId'> | null | undefined,
): boolean {
  return Boolean(getSmsTemplateMessageId(template));
}

export interface SmsTemplate {
  _id: string;
  templateId: string;
  messageId?: string;
  dltMessageId?: string;
  contentTemplateId?: string;
  entityId?: string;
  templateName: string;
  templateContent: string;
  sampleContent?: string;
  senderId?: string;
  category?: string;
  templateType?: string;
  verificationStatus?: boolean;
  jioStatus?: string;
  approvalDate?: string;
  validTill?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SmsTemplateImportSummary {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  inactive: number;
  errors: number;
}

export interface SmsTemplateListResponse {
  success: boolean;
  data: SmsTemplate[];
  meta?: { count: number; activeOnly?: boolean };
}

export interface SmsTemplateImportResponse {
  success: boolean;
  message?: string;
  data: SmsTemplateImportSummary;
}

@Injectable({ providedIn: 'root' })
export class SmsTemplateService {
  constructor(private readonly http: HttpClient) {}

  getTemplates(options: {
    search?: string;
    activeOnly?: boolean;
    includeInactive?: boolean;
  } = {}): Observable<SmsTemplateListResponse> {
    let params = new HttpParams();
    if (options.search?.trim()) {
      params = params.set('search', options.search.trim());
    }
    if (options.activeOnly) {
      params = params.set('activeOnly', 'true');
    }
    if (options.includeInactive) {
      params = params.set('includeInactive', 'true');
    }
    return this.http.get<SmsTemplateListResponse>('/api/sms/templates', { params });
  }

  importTemplates(file: File): Observable<SmsTemplateImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SmsTemplateImportResponse>('/api/sms/templates/import', formData);
  }

  setTemplateActive(id: string, isActive: boolean): Observable<{ success: boolean; data: SmsTemplate }> {
    return this.http.patch<{ success: boolean; data: SmsTemplate }>(`/api/sms/templates/${id}/active`, { isActive });
  }

  updateMessageId(id: string, messageId: string): Observable<{ success: boolean; message?: string; data: SmsTemplate }> {
    return this.http.put<{ success: boolean; message?: string; data: SmsTemplate }>(
      `/api/sms/templates/${id}/message-id`,
      { messageId },
    );
  }
}
