import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/** Fast2SMS DLT Manager Message ID (short numeric). Not the 15–20 digit DLT content template ID. */
export function isFast2smsMessageId(value: string | undefined | null): boolean {
  const id = String(value ?? '').trim();
  return /^\d{1,11}$/.test(id);
}

export function getFast2smsMessageId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId' | 'fast2smsMessageId'> | null | undefined,
): string {
  const candidates = [
    template?.fast2smsMessageId,
    template?.messageId,
    template?.dltMessageId,
  ].map((v) => String(v ?? '').trim()).filter(Boolean);

  return candidates.find(isFast2smsMessageId) || '';
}

export function getSmsTemplateMessageId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId' | 'fast2smsMessageId'> | null | undefined,
): string {
  return getFast2smsMessageId(template);
}

export function hasSmsTemplateMessageId(
  template: Pick<SmsTemplate, 'messageId' | 'dltMessageId' | 'fast2smsMessageId'> | null | undefined,
): boolean {
  return Boolean(getFast2smsMessageId(template));
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

  const fast2smsId = getFast2smsMessageId(template);
  const rawStored = String(template.messageId || template.dltMessageId || '').trim();
  if (rawStored && !isFast2smsMessageId(rawStored)) {
    issues.push('Stored messageId is a DLT Content Template ID, not a Fast2SMS Message ID — run Sync Templates from Fast2SMS');
  } else if (!fast2smsId) {
    if (template.provider === 'excel') {
      issues.push('Missing Fast2SMS Message ID — Fast2SMS sync required (Excel import does not provide Message ID)');
    } else {
      issues.push('Missing Fast2SMS Message ID — Fast2SMS sync required');
    }
  }

  return issues;
}

export function getSmsTemplateContent(
  template: Pick<SmsTemplate, 'content' | 'templateContent'> | null | undefined,
): string {
  return String(template?.content || template?.templateContent || '').trim();
}

/** DLT template ID for Fast2SMS POST /dev/custom bulk (`message` field). */
export function getBulkDltMessageParam(
  template: Pick<SmsTemplate, 'dltTemplateId' | 'contentTemplateId' | 'templateId' | 'messageId' | 'fast2smsMessageId'> | null | undefined,
): string {
  const dltId = getSmsTemplateDltId(template);
  if (dltId) {
    return dltId;
  }
  return getFast2smsMessageId(template);
}

export function isSmsTemplateReadyForBulkDlt(
  template: Pick<
    SmsTemplate,
    | 'senderId'
    | 'content'
    | 'templateContent'
    | 'dltTemplateId'
    | 'contentTemplateId'
    | 'templateId'
    | 'messageId'
    | 'fast2smsMessageId'
  > | null | undefined,
): boolean {
  if (!template) {
    return false;
  }
  const senderId = String(template.senderId || '').trim();
  const content = getSmsTemplateContent(template);
  return Boolean(senderId && content && getBulkDltMessageParam(template));
}

export function isSmsTemplateReadyToSend(
  template: Pick<
    SmsTemplate,
    | 'messageId'
    | 'dltMessageId'
    | 'fast2smsMessageId'
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
  return Boolean(senderId && content && hasSmsTemplateMessageId(template));
}

export interface SmsTemplateVariableSlot {
  index: number;
  label: string;
}

export interface SmsTemplate {
  _id: string;
  templateId: string;
  crmTemplateId?: string;
  templateName: string;
  messageId?: string;
  fast2smsMessageId?: string;
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

  getLiveTemplates(): Observable<SmsTemplateListResponse & { source?: string }> {
    return this.http.get<SmsTemplateListResponse & { source?: string }>('/api/sms/templates/live');
  }

  sendBulkDlt(payload: {
    groupId: string;
    template: {
      _id?: string;
      messageId?: string;
      senderId?: string;
      entityId?: string;
      templateContent: string;
      templateName?: string;
      templateId?: string;
      dltTemplateId?: string;
      contentTemplateId?: string;
    };
    variables?: string[];
  }): Observable<{ success: boolean; sentCount?: number; message?: string }> {
    return this.http.post<{ success: boolean; sentCount?: number; message?: string }>(
      '/api/sms/send-bulk-dlt',
      payload,
    );
  }

  getTemplates(options: {
    search?: string;
    activeOnly?: boolean;
    includeInactive?: boolean;
    provider?: 'fast2sms' | 'excel';
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
    if (options.provider) {
      params = params.set('provider', options.provider);
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
