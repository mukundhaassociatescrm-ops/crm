import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
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
type WalletPopover = 'whatsapp' | 'sms' | null;

@Component({
  selector: 'app-header-communication-wallets',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header-communication-wallets.component.html',
  styleUrl: './header-communication-wallets.component.scss',
})
export class HeaderCommunicationWalletsComponent implements OnInit, OnDestroy {
  isLoading = true;
  data: CommunicationWalletsResponse | null = null;
  openPopover: WalletPopover = null;

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

  get whatsappPillLabel(): string {
    if (this.isLoading) {
      return '…';
    }
    if (!this.whatsapp?.success) {
      return '—';
    }
    return this.formatCompactMoney(this.whatsapp.currentBalance, this.whatsapp.currency || 'USD');
  }

  get smsPillLabel(): string {
    if (this.isLoading) {
      return '…';
    }
    if (!this.sms?.success) {
      return '—';
    }
    return this.formatCompactMoney(this.sms.wallet, 'INR');
  }

  get smsCountPillLabel(): string {
    if (!this.sms?.success) {
      return '';
    }
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(this.sms.smsCount);
  }

  get smsWalletDetail(): string {
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

  get smsCountDetail(): string {
    return this.sms?.success ? `${this.smsCountFormatted} SMS available` : '—';
  }

  get whatsappBalanceDetail(): string {
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

  get whatsappOverdraftDetail(): string {
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

  get smsCountFormatted(): string {
    if (!this.sms?.success) {
      return '—';
    }
    return new Intl.NumberFormat('en-IN').format(this.sms.smsCount);
  }

  get whatsappLevel(): BalanceLevel {
    if (!this.whatsapp?.success) {
      return this.isLoading ? 'unknown' : 'unknown';
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
      return this.isLoading ? 'unknown' : 'unknown';
    }
    if (this.sms.smsCount < SMS_CRITICAL_COUNT) {
      return 'critical';
    }
    if (this.sms.smsCount < SMS_LOW_COUNT) {
      return 'low';
    }
    return 'healthy';
  }

  togglePopover(which: WalletPopover, event: Event): void {
    event.stopPropagation();
    this.openPopover = this.openPopover === which ? null : which;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.header-wallets')) {
      this.openPopover = null;
    }
  }

  private formatCompactMoney(amount: number, currency: string): string {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      const symbol = currency === 'INR' ? '₹' : '$';
      return `${symbol}${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)}`;
    }
  }

  private load(showSpinner = true): void {
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
