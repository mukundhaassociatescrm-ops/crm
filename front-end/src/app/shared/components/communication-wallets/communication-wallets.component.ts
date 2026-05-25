import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  CommunicationWalletService,
  CommunicationWalletsResponse,
  SmsWalletData,
  WhatsappWalletData,
} from '../../../core/services/communication-wallet.service';

const SMS_LOW_COUNT = 3000;
const SMS_CRITICAL_COUNT = 1000;
const WHATSAPP_LOW_USD = 50;
const WHATSAPP_CRITICAL_USD = 20;

type BalanceLevel = 'healthy' | 'low' | 'critical' | 'unknown';

@Component({
  selector: 'app-communication-wallets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './communication-wallets.component.html',
  styleUrl: './communication-wallets.component.scss',
})
export class CommunicationWalletsComponent implements OnInit, OnDestroy {
  isLoading = true;
  data: CommunicationWalletsResponse | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly walletService: CommunicationWalletService) {}

  ngOnInit(): void {
    this.load();
    interval(5 * 60 * 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.load(false));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get sms(): SmsWalletData | null {
    return this.data?.sms ?? null;
  }

  get whatsapp(): WhatsappWalletData | null {
    return this.data?.whatsapp ?? null;
  }

  get smsWalletFormatted(): string {
    if (!this.sms?.success) {
      return '—';
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.sms.wallet);
  }

  get smsCountFormatted(): string {
    if (!this.sms?.success) {
      return '—';
    }
    return new Intl.NumberFormat('en-IN').format(this.sms.smsCount);
  }

  get whatsappBalanceFormatted(): string {
    if (!this.whatsapp?.success) {
      return '—';
    }
    const currency = this.whatsapp.currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(this.whatsapp.currentBalance);
    } catch {
      return `${currency} ${this.whatsapp.currentBalance.toFixed(2)}`;
    }
  }

  get whatsappOverdraftFormatted(): string {
    if (!this.whatsapp?.success) {
      return '—';
    }
    const currency = this.whatsapp.currency || 'USD';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(this.whatsapp.overDraftLimit);
    } catch {
      return `${currency} ${this.whatsapp.overDraftLimit.toFixed(2)}`;
    }
  }

  get whatsappLevel(): BalanceLevel {
    if (!this.whatsapp?.success) {
      return 'unknown';
    }
    const balance = this.whatsapp.currentBalance;
    if (balance < WHATSAPP_CRITICAL_USD) {
      return 'critical';
    }
    if (balance < WHATSAPP_LOW_USD) {
      return 'low';
    }
    return 'healthy';
  }

  get smsLevel(): BalanceLevel {
    if (!this.sms?.success) {
      return 'unknown';
    }
    if (this.sms.smsCount < SMS_CRITICAL_COUNT) {
      return 'critical';
    }
    if (this.sms.smsCount < SMS_LOW_COUNT) {
      return 'low';
    }
    return 'healthy';
  }

  load(showSpinner = true): void {
    if (showSpinner) {
      this.isLoading = true;
    }
    this.walletService
      .getWallets()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          this.data = res;
        },
        error: () => {
          this.isLoading = false;
          this.data = {
            success: false,
            sms: { success: false, message: 'Unable to fetch wallet balance' },
            whatsapp: { success: false, message: 'Unable to fetch wallet balance' },
          };
        },
      });
  }
}
