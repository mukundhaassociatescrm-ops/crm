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

export function getSmsTemplateDltId(
  template: Pick<SmsTemplate, 'dltTemplateId' | 'contentTemplateId' | 'templateId'> | null | undefined,
): string {
  const dltTemplateId = String(template?.dltTemplateId || '').trim();
  if (dltTemplateId && !dltTemplateId.startsWith('f2sms:')) {
    return dltTemplateId;
  }
  const contentTemplateId = String(template?.contentTemplateId || '').trim();
  if (contentTemplateId && !contentTemplateId.startsWith('f2sms:')) {
    return contentTemplateId;
  }
  const templateId = String(template?.templateId || '').trim();
  if (templateId && !templateId.startsWith('f2sms:')) {
    return templateId;
  }
  return '';
}

export function hasSmsTemplateDltRouteId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId' | 'contentTemplateId' | 'templateId'> | null | undefined,
): boolean {
  return hasSmsTemplateMessageId(template) || Boolean(getSmsTemplateDltId(template));
}

export function getSmsTemplateReadinessIssues(
  template: Pick<
    SmsTemplate,
    | 'messageId'
    | 'dltMessageId'
    | 'dltTemplateId'
    | 'contentTemplateId'
    | 'templateId'
    | 'senderId'
    | 'content'
    | 'templateContent'
    | 'provider'
  > | null | undefined,
): string[] {
  if (!template) {
    return ['No template selected'];
  }

  const issues: string[] = [];
  const senderId = String(template.senderId || '').trim();
  const content = getSmsTemplateContent(template);

  if (!senderId) {
    issues.push('Missing Sender ID — run Sync Templates from Fast2SMS');
  }

  if (!content) {
    issues.push('Missing template content — Fast2SMS sync incomplete');
  }

  if (!hasSmsTemplateMessageId(template)) {
    if (template.provider === 'excel') {
      issues.push('Missing Fast2SMS Message ID — Fast2SMS sync required (Excel import does not provide Message ID)');
    } else {
      issues.push('Missing Fast2SMS Message ID — Fast2SMS sync required');
    }
  }

  if (!hasSmsTemplateMessageId(template) && !getSmsTemplateDltId(template)) {
    issues.push('Missing DLT Template ID — template sync incomplete');
  }

  return issues;
}

export function getSmsTemplateContent(
  template: Pick<SmsTemplate, 'content' | 'templateContent'> | null | undefined,
): string {
  return String(template?.content || template?.templateContent || '').trim();
}

export function isSmsTemplateReadyToSend(
  template: Pick<
    SmsTemplate,
    | 'messageId'
    | 'dltMessageId'
    | 'dltTemplateId'
    | 'contentTemplateId'
    | 'templateId'
    | 'senderId'
    | 'content'
    | 'templateContent'
    | 'ready'
  > | null | undefined,
): boolean {
  if (!template) {
    return false;
  }
  if (template.ready === true) {
    return true;
  }
  const senderId = String(template.senderId || '').trim();
  const content = getSmsTemplateContent(template);
  return Boolean(senderId && content && hasSmsTemplateDltRouteId(template));
}

export interface SmsTemplateVariableSlot {
  index: number;
  label: string;
}

export interface SmsTemplate {
  _id: string;
  templateId: string;
  templateName: string;
  messageId?: string;
  dltMessageId?: string;
  dltTemplateId?: string;
  contentTemplateId?: string;
  content?: string;
  entityId?: string;
  entityName?: string;
  templateContent: string;
  variables?: SmsTemplateVariableSlot[];
  route?: string;
  ready?: boolean;
  sampleContent?: string;
  senderId?: string;
  category?: string;
  templateType?: string;
  approvalStatus?: string;
  provider?: string;
  syncedAt?: string;
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

export interface SmsTemplateListMeta {
  count: number;
  total?: number;
  page?: number;
  limit?: number;
  pages?: number;
  activeOnly?: boolean;
}

export interface SmsTemplateListResponse {
  success: boolean;
  data: SmsTemplate[];
  meta?: SmsTemplateListMeta;
}

export interface SmsTemplateSyncResponse {
  success: boolean;
  message?: string;
  synced: number;
  created: number;
  updated: number;
  skipped?: number;
  errors?: number;
  parsed?: number;
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
    page?: number;
    limit?: number;
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
    if (options.page) {
      params = params.set('page', String(options.page));
    }
    if (options.limit) {
      params = params.set('limit', String(options.limit));
    }
    return this.http.get<SmsTemplateListResponse>('/api/sms/templates', { params });
  }

  syncTemplates(): Observable<SmsTemplateSyncResponse> {
    return this.http.post<SmsTemplateSyncResponse>('/api/sms/templates/sync', {});
  }

  importTemplates(file: File): Observable<SmsTemplateImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SmsTemplateImportResponse>('/api/sms/templates/import', formData);
  }

  setTemplateActive(id: string, isActive: boolean): Observable<{ success: boolean; data: SmsTemplate }> {
    return this.http.patch<{ success: boolean; data: SmsTemplate }>(`/api/sms/templates/${id}/active`, { isActive });
  }
}
