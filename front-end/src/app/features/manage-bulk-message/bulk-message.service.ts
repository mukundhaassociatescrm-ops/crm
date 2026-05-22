import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type MessageChannel = 'sms' | 'whatsapp';

export interface SendBulkMessagePayload {
  groupId: string;
  message: string;
  channel: MessageChannel;
  /** Required when channel is whatsapp */
  templateId?: string;
  params?: string[];
  expectedParamCount?: number;
  attachmentUrl?: string;
  attachmentFilename?: string;
  attachmentMimeType?: string;
}

export interface SendBulkMessageResponse {
  success: boolean;
  sentCount: number;
  failedCount?: number;
  submittedCount?: number;
  partial?: boolean;
  failures?: Array<{
    phone?: string;
    normalizedPhone?: string;
    error?: string;
  }>;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class BulkMessageService {
  private readonly baseUrl = '/api/messages';

  constructor(private readonly http: HttpClient) {}

  sendBulkMessage(payload: SendBulkMessagePayload): Observable<SendBulkMessageResponse> {
    return this.http.post<SendBulkMessageResponse>(`${this.baseUrl}/send-bulk`, payload);
  }
}
