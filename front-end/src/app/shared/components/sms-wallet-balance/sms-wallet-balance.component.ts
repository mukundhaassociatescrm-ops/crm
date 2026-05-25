import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SmsWalletService } from '../../../core/services/sms-wallet.service';

/** Show low-balance warning when SMS count falls below this threshold. */
const LOW_SMS_THRESHOLD = 3000;

@Component({
  selector: 'app-sms-wallet-balance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sms-wallet-balance.component.html',
  styleUrl: './sms-wallet-balance.component.scss',
})
export class SmsWalletBalanceComponent implements OnInit, OnDestroy {
  @Input() compact = false;

  isLoading = true;
  hasError = false;
  wallet: number | null = null;
  smsCount: number | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly smsWalletService: SmsWalletService) {}

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

  get walletFormatted(): string {
    if (this.wallet == null) {
      return '—';
    }
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.wallet);
  }

  get smsCountFormatted(): string {
    if (this.smsCount == null) {
      return '—';
    }
    return new Intl.NumberFormat('en-IN').format(this.smsCount);
  }

  get isLowBalance(): boolean {
    return this.smsCount != null && this.smsCount < LOW_SMS_THRESHOLD;
  }

  get lowBalanceMessage(): string {
    if (this.smsCount == null) {
      return '';
    }
    return `Only ${this.smsCountFormatted} SMS remaining`;
  }

  load(showSpinner = true): void {
    if (showSpinner) {
      this.isLoading = true;
    }
    this.smsWalletService
      .getWalletBalance()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          if (!res.success) {
            this.hasError = true;
            this.wallet = null;
            this.smsCount = null;
            return;
          }
          this.hasError = false;
          this.wallet = res.wallet;
          this.smsCount = res.smsCount;
        },
        error: () => {
          this.isLoading = false;
          this.hasError = true;
          this.wallet = null;
          this.smsCount = null;
        },
      });
  }
}
