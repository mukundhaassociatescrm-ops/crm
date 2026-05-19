import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ReportStatus = 'Paid' | 'Pending';

export interface ReportClient {
  name: string;
  address: string;
  gst: string;
}

export interface ReportItem {
  description: string;
  subDescription?: string;
  hsn?: string;
  quantity?: number;
  rate?: number;
  amount: number;
}

export interface ReportBankDetails {
  bankName: string;
  accountNumber: string;
  ifsc: string;
}

export interface ReportPayload {
  date: string;
  placeOfSupply: string;
  client: ReportClient;
  items: ReportItem[];
  status: ReportStatus;
  bankDetails: ReportBankDetails;
  declaration: string;
}

export interface Report extends ReportPayload {
  _id: string;
  invoiceNumber: string;
  subtotal: number;
  taxableSubtotal?: number;
  nonTaxableSubtotal?: number;
  cgst: number;
  sgst: number;
  total: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly baseUrl = '/api/reports';

  constructor(private readonly http: HttpClient) {}

  getReports(): Observable<ApiResponse<Report[]>> {
    return this.http.get<ApiResponse<Report[]>>(this.baseUrl);
  }

  getReport(id: string): Observable<ApiResponse<Report>> {
    return this.http.get<ApiResponse<Report>>(`${this.baseUrl}/${id}`);
  }

  createReport(payload: ReportPayload): Observable<ApiResponse<Report>> {
    return this.http.post<ApiResponse<Report>>(this.baseUrl, payload);
  }

  updateReport(id: string, payload: ReportPayload): Observable<ApiResponse<Report>> {
    return this.http.put<ApiResponse<Report>>(`${this.baseUrl}/${id}`, payload);
  }

  deleteReport(id: string): Observable<ApiResponse<{ message?: string }>> {
    return this.http.delete<ApiResponse<{ message?: string }>>(`${this.baseUrl}/${id}`);
  }
}
