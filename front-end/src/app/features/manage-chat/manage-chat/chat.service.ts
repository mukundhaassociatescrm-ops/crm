import { HttpClient, HttpEventType, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';
import { Customer } from '../../../shared/models/customer.model';

export const isValidMongoObjectId = (value: unknown): boolean => {
  const raw = String(value ?? '').trim();
  return /^[a-fA-F0-9]{24}$/.test(raw);
};

export interface ChatConversation {
  /** Canonical chat key (phone) used for routing and message APIs. */
  _id: string;
  /** MongoDB Conversation document _id — required for task linkage. */
  conversationMongoId?: string;
  phoneNumber: string;
  clientName?: string;
  lastMessage: string;
  unreadCount?: number;
  lastReadAt?: string | null;
  /** Last inbound/outbound message time — inbox sort key (not read/select). */
  lastMessageAt?: string | null;
  updatedAt: string;
  createdAt?: string;
}

export interface ChatLinkedTask {
  taskId: string;
  displayId?: string;
  title: string;
  status: string;
  dueDate?: string | null;
  assigneeName?: string;
}

export interface ChatMessage {
  _id?: string;
  messageId: string;
  conversationId: string;
  from: string;
  to: string;
  text: string;
  type: 'text' | 'file';
  fileUrl?: string;
  filename?: string;
  mimeType?: string;
  mediaType?: string;
  mediaUrl?: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  replyTo?: string;
  templateId?: string;
  templateName?: string;
  templateBody?: string;
  metadata?: ChatMessageMetadata;
  createdAt?: string;
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string | null;
  important?: boolean;
  linkedTask?: ChatLinkedTask | null;
}

export interface TemplateDisplayFields {
  text?: string;
  templateId?: string;
  templateName?: string;
  templateBody?: string;
}

const isTemplateUuidText = (value: string): boolean => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^Template:\s*(.+)$/i);
  const candidate = match ? match[1].trim() : normalized;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
};

export const resolveTemplateDisplayText = (
  message: TemplateDisplayFields,
  options?: { variableValues?: Record<number, string> },
): string => {
  const storedText = String(message.text || '').trim();
  const rawBody = String(message.templateBody || '').trim();
  const variableValues = options?.variableValues || {};
  const hasVariableValues = Object.values(variableValues).some((value) => String(value || '').trim());

  if (storedText && !isTemplateUuidText(storedText) && storedText !== rawBody) {
    return storedText;
  }

  if (rawBody) {
    const renderedBody = rawBody.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index) => {
      const key = Number(index);
      const value = String(variableValues[key] || '').trim();
      return value || `{{${key}}}`;
    });

    if (renderedBody && (hasVariableValues || !/\{\{\s*\d+\s*\}\}/.test(renderedBody))) {
      return renderedBody;
    }

    if (storedText && !isTemplateUuidText(storedText)) {
      return storedText;
    }

    if (renderedBody) {
      return renderedBody;
    }
  }
  const templateName = String(message.templateName || '').trim();
  const templateId = String(message.templateId || '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (storedText && !/^Template:\s*/i.test(storedText)) {
    return storedText;
  }

  if (storedText && /^Template:\s*/i.test(storedText)) {
    const suffix = storedText.replace(/^Template:\s*/i, '').trim();
    if (!uuidPattern.test(suffix)) {
      return suffix;
    }
  }

  if (storedText && !uuidPattern.test(storedText.replace(/^Template:\s*/i, '').trim())) {
    return storedText.replace(/^Template:\s*/i, '').trim() || storedText;
  }

  if (templateName) {
    return templateName;
  }

  if (templateId && !uuidPattern.test(templateId)) {
    return templateId;
  }

  return storedText || templateId || 'Template message';
};

export interface ChatMessageMetadata {
  sourceChannel: 'meta-cloud-api' | 'meta-webhook-sandbox';
  campaign: string;
  journeyStep: string;
  confidence: number;
  tags: string[];
  payloadId: string;
}

export interface ApiListResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    source?: string;
  };
}

export interface SendMessageRequest {
  to: string;
  text: string;
  message?: string;
}

export interface SendMessageResponse {
  success: boolean;
  data?: {
    provider?: string;
    messageId?: string;
    type?: 'text' | 'template';
  };
  message?: string;
}

export interface UploadFileResponse {
  success: boolean;
  data?: {
    url: string;
    filename: string;
    mimeType: string;
  };
  message?: string;
}

export interface UploadFileProgressEvent {
  done: boolean;
  progress: number;
  data?: UploadFileResponse['data'];
  message?: string;
}

export interface SendFileRequest {
  to: string;
  fileUrl: string;
  filename: string;
  mimeType?: string;
}

export interface SendTemplateRequest {
  to: string;
  phone?: string;
  templateId: string;
  templateName?: string;
  templateBody?: string;
  params: string[];
  mediaUrl?: string;
  attachmentUrl?: string;
  /** When set and > 0, server validates param count and non-empty values. */
  expectedParamCount?: number;
}

export interface WhatsAppTemplateOption {
  id: string;
  name: string;
  category: string;
  language: string;
  body: string;
  variables: number[];
  headerType?: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  requiresImageHeader?: boolean;
}

export interface ChatStartResponse {
  success: boolean;
  data?: {
    phone: string;
    nextAction: 'open_chat' | 'select_template';
    session: {
      isActive: boolean;
      lastIncomingAt: string | null;
      expiresAt: string | null;
    };
    templates: WhatsAppTemplateOption[];
  };
  code?: string;
  message?: string;
}

/** Source of truth for WhatsApp 24h session window (GET /api/chat/session-status). */
export interface ChatSessionStatusResponse {
  success: boolean;
  data?: {
    active: boolean;
    lastIncomingAt: string | null;
    expiresAt: string | null;
    phone?: string;
  };
  message?: string;
}

export interface RealtimeChatEvent {
  eventType: 'incoming' | 'outgoing' | 'status' | 'read';
  phone: string;
  messageId?: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  text?: string;
  source?: string;
  destination?: string;
  timestamp?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly socket: Socket;
  private readonly apiBaseUrl = String(environment.apiBaseUrl || '').replace(/\/$/, '');
  private readonly socketBaseUrl = this.apiBaseUrl || window.location.origin;

  constructor(private readonly http: HttpClient) {
    this.socket = io(this.socketBaseUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }

  onSocketConnectionState(): Observable<boolean> {
    return new Observable<boolean>((subscriber) => {
      const emitState = () => subscriber.next(this.socket.connected);
      const onConnect = () => subscriber.next(true);
      const onDisconnect = () => subscriber.next(false);

      emitState();
      this.socket.on('connect', onConnect);
      this.socket.on('disconnect', onDisconnect);

      return () => {
        this.socket.off('connect', onConnect);
        this.socket.off('disconnect', onDisconnect);
      };
    });
  }

  getConversations(search = ''): Observable<ApiListResponse<ChatConversation[]>> {
    const term = String(search || '').trim();
    const params = term ? new HttpParams().set('search', term) : undefined;
    return this.http.get<ApiListResponse<ChatConversation[]>>('/api/chat/conversations', { params });
  }

  searchCustomers(query: string): Observable<ApiListResponse<Customer[]>> {
    const q = String(query || '').trim();
    if (!q) {
      return new Observable<ApiListResponse<Customer[]>>((subscriber) => {
        subscriber.next({ success: true, data: [] });
        subscriber.complete();
      });
    }

    // Backend uses "clients" as customers. Search is supported via GET /api/clients?search=...
    // (The response also includes pagination; we only need `data` here.)
    const params = new HttpParams()
      .set('search', q)
      .set('page', '1')
      .set('limit', '10')
      .set('sort', 'desc');

    return this.http.get<any>('/api/clients', { params }).pipe(
      map((response) => ({
        success: Boolean(response?.success),
        data: Array.isArray(response?.data) ? (response.data as Customer[]) : [],
        message: response?.message,
      }))
    );
  }

  getMessages(
    conversationId: string,
    options?: { limit?: number; before?: string | null },
  ): Observable<ApiListResponse<ChatMessage[]> & { hasMore?: boolean; oldestTimestamp?: string | null }> {
    let params = new HttpParams();
    if (options?.limit) {
      params = params.set('limit', String(options.limit));
    }
    if (options?.before) {
      params = params.set('before', options.before);
    }

    return this.http.get<ApiListResponse<any[]>>(
      `/api/chat/${encodeURIComponent(conversationId)}`,
      { params: params.keys().length ? params : undefined },
    ).pipe(
      map((response) => ({
        ...response,
        hasMore: Boolean((response as { hasMore?: boolean }).hasMore),
        oldestTimestamp: (response as { oldestTimestamp?: string | null }).oldestTimestamp || null,
        data: this.normalizeMessageRows(conversationId, response.data || []),
      })),
    );
  }

  private normalizeMessageRows(conversationId: string, rows: any[]): ChatMessage[] {
    return (rows || []).reduce<ChatMessage[]>((acc, item) => {
          const normalizedText = String(item.text || '').trim();
          const rawMediaUrl = String(item.mediaUrl || '').trim();
          const rawFileUrl = String(item.fileUrl || rawMediaUrl || item.url || '').trim();
          const fileUrl = this.toAbsoluteFileUrl(rawFileUrl);
          const inferredNameFromUrl = fileUrl ? decodeURIComponent(fileUrl.split('?')[0].split('/').pop() || '') : '';
          const filename = String(item.filename || inferredNameFromUrl || '').trim();
          const mimeType = String(item.mimeType || item.mimetype || '').trim();
          const mediaType = String(item.mediaType || this.inferMediaType(mimeType, filename, fileUrl)).trim().toLowerCase();
          const rawType = String(item.type || 'text').toLowerCase();
          const looksLikeMediaText = ['image', 'document', 'video', 'audio', 'file', 'sticker'].includes(normalizedText.toLowerCase());
          const isFileMessage = rawType === 'file' || Boolean(fileUrl || filename || looksLikeMediaText || mediaType);

          if (!normalizedText && !isFileMessage && !item.deleted) {
            return acc;
          }

          const normalizedDirection = String(item.direction || '').toLowerCase();
          const isIncoming = normalizedDirection === 'in' || normalizedDirection === 'incoming';
          const normalizedStatus = String(item.status || 'sent').toLowerCase();
          const phone = String(item.phone || conversationId);

          const templateId = String(item.templateId || '').trim();
          const templateName = String(item.templateName || '').trim();
          const templateBody = String(item.templateBody || '').trim();
          const mappedMessage: ChatMessage = {
            _id: item.messageId,
            messageId: item.messageId,
            conversationId,
            from: isIncoming ? phone : 'business',
            to: isIncoming ? 'business' : phone,
            text: normalizedText || filename || inferredNameFromUrl || 'Attachment',
            type: isFileMessage ? 'file' : 'text',
            fileUrl: fileUrl || undefined,
            filename: (filename || normalizedText || inferredNameFromUrl) || undefined,
            mimeType: mimeType || undefined,
            mediaType: mediaType || undefined,
            mediaUrl: this.toAbsoluteFileUrl(rawMediaUrl || rawFileUrl) || undefined,
            direction: isIncoming ? 'incoming' : 'outgoing',
            status: (['sent', 'delivered', 'read', 'failed'].includes(normalizedStatus) ? normalizedStatus : 'sent') as ChatMessage['status'],
            timestamp: item.timestamp,
            templateId: templateId || undefined,
            templateName: templateName || undefined,
            templateBody: templateBody || undefined,
            deleted: Boolean(item.deleted),
            deletedAt: item.deletedAt || null,
            important: Boolean(item.important),
            linkedTask: item.linkedTask || null,
          };

          if (!isFileMessage && (templateId || templateName || templateBody)) {
            mappedMessage.text = resolveTemplateDisplayText(mappedMessage);
          }

          acc.push(mappedMessage);

          return acc;
        }, []);
  }

  softDeleteMessage(messageId: string, restore = false): Observable<ApiListResponse<ChatMessage>> {
    return this.http.patch<ApiListResponse<ChatMessage>>(
      `/api/chat/messages/${encodeURIComponent(messageId)}/delete`,
      { restore },
    );
  }

  toggleMessageImportant(messageId: string, important: boolean): Observable<ApiListResponse<ChatMessage>> {
    return this.http.patch<ApiListResponse<ChatMessage>>(
      `/api/chat/messages/${encodeURIComponent(messageId)}/important`,
      { important },
    );
  }

  sendMessage(data: SendMessageRequest): Observable<SendMessageResponse> {
    const payload = {
      to: data.to,
      text: data.text,
      message: data.message || data.text,
    };
    console.log('[UI HTTP POST]', {
      url: '/api/chat/send',
      body: payload,
    });
    return this.http.post<SendMessageResponse>('/api/chat/send', payload).pipe(
      tap((response) => {
        console.log('[UI HTTP RESPONSE]', response);
      }),
    );
  }

  uploadFile(file: File): Observable<UploadFileProgressEvent> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadFileResponse>('/api/files/upload', formData, {
      observe: 'events',
      reportProgress: true,
    }).pipe(
      map((event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || 1;
          return {
            done: false,
            progress: Math.min(100, Math.round((event.loaded / total) * 100)),
          } as UploadFileProgressEvent;
        }

        if (event.type === HttpEventType.Response) {
          return {
            done: true,
            progress: 100,
            data: event.body?.data,
            message: event.body?.message,
          } as UploadFileProgressEvent;
        }

        return {
          done: false,
          progress: 0,
        } as UploadFileProgressEvent;
      })
    );
  }

  sendFile(data: SendFileRequest): Observable<SendMessageResponse> {
    return this.http.post<SendMessageResponse>('/api/chat/send-file', data);
  }

  sendTemplate(data: SendTemplateRequest): Observable<SendMessageResponse> {
    const payload = {
      to: data.to,
      phone: data.phone || data.to,
      templateId: data.templateId,
      templateName: data.templateName || '',
      templateBody: data.templateBody || '',
      params: Array.isArray(data.params) ? data.params : [],
      ...(data.expectedParamCount !== undefined ? { expectedParamCount: data.expectedParamCount } : {}),
    };
    console.log('[UI TEMPLATE API CALL]', {
      url: '/api/chat/send-template',
      payload,
    });
    return this.http.post<SendMessageResponse>('/api/chat/send-template', payload).pipe(
      tap((response) => {
        console.log('[UI HTTP TEMPLATE RESPONSE]', response);
      }),
    );
  }

  getTemplates(options?: { language?: string; refresh?: boolean }): Observable<ApiListResponse<WhatsAppTemplateOption[]>> {
    console.log('[UI FETCH TEMPLATES TRIGGERED]', {
      endpoint: '/api/chat/templates',
      language: options?.language || '',
      refresh: Boolean(options?.refresh),
    });

    let params = new HttpParams();
    if (options?.language) {
      params = params.set('language', options.language);
    }
    if (options?.refresh) {
      params = params.set('refresh', 'true');
    }

    return this.http.get<ApiListResponse<WhatsAppTemplateOption[]>>('/api/chat/templates', { params }).pipe(
      tap((response) => {
        const templates = Array.isArray(response?.data) ? response.data : [];
        const rawSource = String(response?.meta?.source || 'API').toUpperCase();
        const source = rawSource === 'HARDCODED' ? 'HARDCODED' : 'API';
        console.log('[TEMPLATE SOURCE]', {
          source,
          count: templates.length,
          rawSource,
        });
      }),
    );
  }

  startChat(to: string): Observable<ChatStartResponse> {
    return this.http.post<ChatStartResponse>('/api/chat/start', { to });
  }

  getSessionStatus(phone: string): Observable<ChatSessionStatusResponse> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<ChatSessionStatusResponse>('/api/chat/session-status', { params });
  }

  markConversationAsRead(phone: string): Observable<{ success: boolean; data?: { phoneNumber: string; unreadCount: number; lastReadAt?: string | null } }> {
    return this.http.post<{ success: boolean; data?: { phoneNumber: string; unreadCount: number; lastReadAt?: string | null } }>(`/api/chat/${encodeURIComponent(phone)}/read`, {});
  }

  onRealtimeUpdates(): Observable<RealtimeChatEvent> {
    return new Observable<RealtimeChatEvent>((subscriber) => {
      const handler = (event: RealtimeChatEvent) => subscriber.next(event);
      this.socket.on('chat:update', handler);

      return () => {
        this.socket.off('chat:update', handler);
      };
    });
  }

  private toAbsoluteFileUrl(url: string): string {
    const normalized = String(url || '').trim();
    if (!normalized) {
      return '';
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    if (normalized.startsWith('/')) {
      return this.apiBaseUrl ? `${this.apiBaseUrl}${normalized}` : normalized;
    }

    return this.apiBaseUrl ? `${this.apiBaseUrl}/${normalized}` : normalized;
  }

  private inferMediaType(mimeType: string, filename: string, fileUrl: string): string {
    const normalizedMimeType = String(mimeType || '').toLowerCase();
    const normalizedName = String(filename || '').toLowerCase();
    const normalizedUrl = String(fileUrl || '').toLowerCase();

    if (normalizedMimeType.startsWith('video/') || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(normalizedName) || /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(normalizedUrl)) {
      return 'video';
    }

    if (normalizedMimeType.startsWith('audio/') || /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(normalizedName) || /\.(ogg|mp3|wav|m4a|aac)(\?|$)/i.test(normalizedUrl)) {
      return 'audio';
    }

    if (normalizedMimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(normalizedName) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(normalizedUrl)) {
      return 'image';
    }

    return '';
  }
}