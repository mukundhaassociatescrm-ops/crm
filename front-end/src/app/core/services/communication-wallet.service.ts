import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SmsWalletData =
  | { success: true; wallet: number; smsCount: number }
  | { success: false; message?: string };

export type WhatsappWalletData =
  | { success: true; currency: string; currentBalance: number; overDraftLimit: number }
  | { success: false; message?: string };

export type CommunicationWalletsResponse = {
  success: boolean;
  sms: SmsWalletData;
  whatsapp: WhatsappWalletData;
  cached?: boolean;
  cachedAt?: string;
};

@Injectable({ providedIn: 'root' })
export class CommunicationWalletService {
  private readonly baseUrl = '/api/communication/wallets';

  constructor(private readonly http: HttpClient) {}

  getWallets(refresh = false): Observable<CommunicationWalletsResponse> {
    let params = new HttpParams();
    if (refresh) {
      params = params.set('refresh', 'true');
    }
    return this.http.get<CommunicationWalletsResponse>(this.baseUrl, { params });
  }
}
