import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SmsWalletBalance = {
  success: boolean;
  wallet: number | null;
  smsCount: number | null;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class SmsWalletService {
  private readonly baseUrl = '/api/sms/wallet-balance';

  constructor(private readonly http: HttpClient) {}

  getWalletBalance(): Observable<SmsWalletBalance> {
    return this.http.get<SmsWalletBalance>(this.baseUrl);
  }
}
