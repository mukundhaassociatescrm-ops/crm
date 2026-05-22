import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface TaskAttachment {
  _id?: string;
  url: string;
  fileName: string;
  mimeType?: string;
  note?: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface Task {
  _id?: string;
  title: string;
  description: string;
  assignedTo: string | { _id?: string; name?: string; fullName?: string; email?: string; phone?: string };
  customerName?: string;
  customerPhone?: string;
  paymentReceived?: boolean;
  reportSent?: boolean;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'In Progress' | 'Report Sent' | 'Completed';
  dueDate: string;
  reminderEnabled?: boolean;
  reminderBefore?: string | number;
  reminderTime?: string;
  reminderSent?: boolean;
  attachments?: TaskAttachment[];
  createdFromChat?: boolean;
  conversationId?: string;
  chatMessageId?: string;
  chatPhone?: string;
  messageText?: string;
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

export interface UpcomingReminder {
  taskId: string;
  kind?: 'task' | 'enquiry';
  taskName: string;
  assignedUser: string;
  reminderTime: string;
  dueDate: string;
  taskStatus: 'Pending' | 'In Progress' | 'Completed' | 'New' | 'Closed' | string;
  priority: 'Low' | 'Medium' | 'High';
  reminderStatus: 'upcoming' | 'overdue' | 'sent';
  reminderSent: boolean;
  overdue: boolean;
}

export interface TaskResponse {
  success: boolean;
  data: Task | Task[];
  message?: string;
}

export interface UpcomingReminderResponse {
  success: boolean;
  data: UpcomingReminder[];
  count?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  constructor(private http: HttpClient) {}

  getTasks(): Observable<TaskResponse> {
    return this.http.get<TaskResponse>('/api/tasks');
  }

  getTaskById(id: string): Observable<TaskResponse> {
    return this.http.get<TaskResponse>(`/api/tasks/${id}`);
  }

  createTask(task: Task): Observable<TaskResponse> {
    return this.http.post<TaskResponse>('/api/tasks', task);
  }

  updateTask(id: string, task: Task): Observable<TaskResponse> {
    return this.http.put<TaskResponse>(`/api/tasks/${id}`, task);
  }

  uploadTaskFile(file: File): Observable<UploadFileResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadFileResponse>('/api/files/upload', formData);
  }

  addTaskAttachment(taskId: string, payload: { url: string; fileName: string; mimeType?: string; note?: string }): Observable<TaskResponse> {
    return this.http.post<TaskResponse>(`/api/tasks/${taskId}/attachments`, payload);
  }

  deleteTask(id: string): Observable<TaskResponse> {
    return this.http.delete<TaskResponse>(`/api/tasks/${id}`);
  }

  getUpcomingReminders(): Observable<UpcomingReminderResponse> {
    return this.http.get<UpcomingReminderResponse>('/api/tasks/reminders/upcoming');
  }

  dismissEnquiry(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>(`/api/contact/${id}`);
  }
}
