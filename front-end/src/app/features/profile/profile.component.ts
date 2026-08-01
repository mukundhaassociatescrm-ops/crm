import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  AuthService,
  ProfileBankDetails,
  ProfileUpiPaymentDetails,
  UpdateProfilePayload,
} from '../auth/auth.service';

const DEFAULT_BANK_DETAILS: ProfileBankDetails = {
  bankName: 'State Bank of India, Coimbatore Nagar Branch',
  accountNumber: '44344893154',
  ifsc: 'SBIN0008608',
};

const DEFAULT_UPI_PAYMENT_DETAILS: ProfileUpiPaymentDetails = {
  upiQrImage: '',
  upiId: '',
  upiMobileNumber: '',
};

const UPI_QR_MAX_BYTES = 2 * 1024 * 1024;
const UPI_QR_MIN_EDGE = 500;
const UPI_QR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

function optionalTenDigitPhone(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value || '').trim();
  if (!raw) {
    return null;
  }
  return /^\d{10}$/.test(raw) ? null : { tenDigitPhone: true };
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  currentUser: any = null;
  saving = false;
  upiQrPreviewUrl = '';
  private pendingUpiQrFile: File | null = null;
  private upiQrRemoved = false;

  profileForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
    newPassword: [''],
    confirmPassword: [''],
    ownerNotificationsEnabled: [false],
    ownerWhatsappNumber: [''],
    whatsappDailyTemplateLimit: [200, [Validators.required, Validators.min(1)]],
    bankDetails: this.fb.group({
      bankName: ['', Validators.required],
      accountNumber: ['', Validators.required],
      ifsc: ['', Validators.required],
    }),
    upiPaymentDetails: this.fb.group({
      upiQrImage: [''],
      upiId: ['', [Validators.maxLength(100)]],
      upiMobileNumber: ['', [optionalTenDigitPhone]],
    }),
  });

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  private get bankDetailsValue(): ProfileBankDetails {
    const raw = this.profileForm.getRawValue().bankDetails;
    return {
      bankName: String(raw?.bankName || '').trim(),
      accountNumber: String(raw?.accountNumber || '').trim(),
      ifsc: String(raw?.ifsc || '').trim().toUpperCase(),
    };
  }

  private get upiPaymentDetailsValue(): ProfileUpiPaymentDetails {
    const raw = this.profileForm.getRawValue().upiPaymentDetails;
    return {
      upiQrImage: String(raw?.upiQrImage || '').trim(),
      upiId: String(raw?.upiId || '').trim().slice(0, 100),
      upiMobileNumber: String(raw?.upiMobileNumber || '').replace(/\D/g, '').slice(0, 10),
    };
  }

  get initials(): string {
    const name: string = this.currentUser?.name || '';
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  }

  get passwordMismatch(): boolean {
    const pw = this.profileForm.get('newPassword')?.value;
    const cpw = this.profileForm.get('confirmPassword')?.value;
    return !!pw && !!cpw && pw !== cpw;
  }

  get hasUpiQrPreview(): boolean {
    return !!this.upiQrPreviewUrl;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getUser();
    this.hydrateProfileFormFromUser(this.currentUser);
    this.loadCompanyPaymentDetailsFromApi();
  }

  private hydrateProfileFormFromUser(user: any): void {
    const profileBankDetails = user?.bankDetails || DEFAULT_BANK_DETAILS;
    const profileUpiDetails: ProfileUpiPaymentDetails = {
      ...DEFAULT_UPI_PAYMENT_DETAILS,
      ...(user?.upiPaymentDetails || {}),
    };

    if (user) {
      this.profileForm.patchValue({
        name: user.name,
        email: user.email,
        ownerNotificationsEnabled: !!user.ownerNotificationsEnabled,
        ownerWhatsappNumber: user.ownerWhatsappNumber || '',
        whatsappDailyTemplateLimit: user.whatsappDailyTemplateLimit || 200,
        bankDetails: profileBankDetails,
        upiPaymentDetails: profileUpiDetails,
      });
      this.upiQrPreviewUrl = String(profileUpiDetails.upiQrImage || '').trim();
    }

    if (!this.isAdmin) {
      this.profileForm.get('bankDetails')?.disable({ emitEvent: false });
      this.profileForm.get('upiPaymentDetails')?.disable({ emitEvent: false });
    }
  }

  private loadCompanyPaymentDetailsFromApi(): void {
    if (!this.isAdmin) {
      return;
    }

    this.authService.getCompanyPaymentDetails().subscribe({
      next: (res) => {
        if (!res?.success || !res.data) {
          return;
        }

        const profileBankDetails = res.data.bankDetails || DEFAULT_BANK_DETAILS;
        const profileUpiDetails: ProfileUpiPaymentDetails = {
          ...DEFAULT_UPI_PAYMENT_DETAILS,
          ...(res.data.upiPaymentDetails || {}),
        };

        this.profileForm.patchValue({
          bankDetails: profileBankDetails,
          upiPaymentDetails: profileUpiDetails,
        });
        this.upiQrPreviewUrl = String(profileUpiDetails.upiQrImage || '').trim();

        const updatedUser = {
          ...(this.currentUser || {}),
          bankDetails: profileBankDetails,
          upiPaymentDetails: profileUpiDetails,
        };
        this.currentUser = updatedUser;
        this.authService.saveUser(updatedUser);
      },
      error: () => {
        // Keep session values if company details API is unavailable.
      },
    });
  }

  onUpiQrSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    input.value = '';

    if (!file) {
      return;
    }

    const mime = String(file.type || '').toLowerCase();
    if (!UPI_QR_ALLOWED_TYPES.has(mime)) {
      this.toastr.error('Invalid file type. Please upload JPG, JPEG, or PNG.', 'Validation Error');
      return;
    }

    if (file.size > UPI_QR_MAX_BYTES) {
      this.toastr.error('QR image must be 2MB or smaller.', 'Validation Error');
      return;
    }

    void this.acceptUpiQrFile(file);
  }

  private async acceptUpiQrFile(file: File): Promise<void> {
    try {
      const dimensions = await this.readImageDimensions(file);
      if (dimensions.width < UPI_QR_MIN_EDGE || dimensions.height < UPI_QR_MIN_EDGE) {
        this.toastr.error(
          'Please upload a high-resolution QR code (minimum 500×500 pixels).',
          'Validation Error',
        );
        return;
      }

      this.pendingUpiQrFile = file;
      this.upiQrRemoved = false;

      const reader = new FileReader();
      reader.onload = () => {
        this.upiQrPreviewUrl = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    } catch {
      this.toastr.error('Unable to read the selected image. Please try another file.', 'Validation Error');
    }
  }

  private readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        URL.revokeObjectURL(objectUrl);
        resolve({ width, height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  }

  removeUpiQrImage(): void {
    this.pendingUpiQrFile = null;
    this.upiQrRemoved = true;
    this.upiQrPreviewUrl = '';
    this.profileForm.get('upiPaymentDetails.upiQrImage')?.setValue('');
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.toastr.error('Please fill in all required fields.', 'Validation Error');
      return;
    }

    if (this.passwordMismatch) {
      this.toastr.error('Passwords do not match.', 'Validation Error');
      return;
    }

    const newPassword = this.profileForm.get('newPassword')?.value || '';
    if (newPassword && newPassword.length < 5) {
      this.toastr.error('Password must be at least 5 characters.', 'Validation Error');
      return;
    }

    this.saving = true;

    const payload: UpdateProfilePayload = {
      name: this.profileForm.get('name')?.value || ''
    };
    if (newPassword) {
      payload.newPassword = newPassword;
    }

    const upload$: Observable<string | null> = this.pendingUpiQrFile
      ? this.authService.uploadProfileFile(this.pendingUpiQrFile).pipe(
          switchMap((res) => {
            if (!res?.success || !res.data?.url) {
              throw new Error(res?.message || 'QR image upload failed.');
            }
            return of(String(res.data.url));
          }),
        )
      : of(null);

    upload$.pipe(
      switchMap((uploadedUrl) => {
        if (this.isAdmin) {
          const raw = this.profileForm.getRawValue();
          payload.bankDetails = this.bankDetailsValue;

          const upi = this.upiPaymentDetailsValue;
          if (uploadedUrl) {
            upi.upiQrImage = uploadedUrl;
          } else if (this.upiQrRemoved) {
            upi.upiQrImage = '';
          }
          payload.upiPaymentDetails = upi;

          payload.ownerNotificationsEnabled = !!raw.ownerNotificationsEnabled;
          payload.ownerWhatsappNumber = String(raw.ownerWhatsappNumber || '').trim();
          const limit = Number.parseInt(String(raw.whatsappDailyTemplateLimit ?? ''), 10);
          if (Number.isFinite(limit) && limit > 0) {
            payload.whatsappDailyTemplateLimit = limit;
          }
        }

        return this.authService.updateProfile(payload);
      }),
    ).subscribe({
      next: (res) => {
        if (res?.success) {
          this.applyProfileUpdate(
            res.data?.name || payload.name || '',
            true,
            res.data,
          );
        } else {
          this.saving = false;
          this.toastr.error(res?.message || 'Update failed.', 'Error');
        }
      },
      error: (err) => {
        if (err?.status === 404) {
          this.applyProfileUpdate(payload.name || '', false, payload);
          return;
        }

        this.saving = false;
        this.toastr.error(err?.error?.message || err?.message || 'Update failed. Please try again.', 'Error');
      }
    });
  }

  private applyProfileUpdate(
    name: string,
    persistedToApi: boolean,
    profileData?: Partial<UpdateProfilePayload> & { whatsappDailyTemplateLimit?: number },
  ): void {
    const updatedUser = {
      ...this.currentUser,
      name,
      bankDetails: profileData?.bankDetails || this.currentUser?.bankDetails || DEFAULT_BANK_DETAILS,
      upiPaymentDetails:
        profileData?.upiPaymentDetails || this.currentUser?.upiPaymentDetails || DEFAULT_UPI_PAYMENT_DETAILS,
      ownerNotificationsEnabled: profileData?.ownerNotificationsEnabled ?? this.currentUser?.ownerNotificationsEnabled,
      ownerWhatsappNumber: profileData?.ownerWhatsappNumber ?? this.currentUser?.ownerWhatsappNumber,
      whatsappDailyTemplateLimit:
        profileData?.whatsappDailyTemplateLimit ?? this.currentUser?.whatsappDailyTemplateLimit,
    };

    this.authService.saveUser(updatedUser);
    this.currentUser = updatedUser;
    this.saving = false;
    this.pendingUpiQrFile = null;
    this.upiQrRemoved = false;
    this.upiQrPreviewUrl = String(updatedUser.upiPaymentDetails?.upiQrImage || '').trim();

    this.profileForm.patchValue({
      name,
      newPassword: '',
      confirmPassword: '',
      ownerNotificationsEnabled: !!updatedUser.ownerNotificationsEnabled,
      ownerWhatsappNumber: updatedUser.ownerWhatsappNumber || '',
      whatsappDailyTemplateLimit: Number(updatedUser.whatsappDailyTemplateLimit) > 0
        ? Number(updatedUser.whatsappDailyTemplateLimit)
        : 200,
      bankDetails: updatedUser.bankDetails,
      upiPaymentDetails: updatedUser.upiPaymentDetails || DEFAULT_UPI_PAYMENT_DETAILS,
    });

    if (persistedToApi) {
      this.toastr.success('Profile updated. Please login again.', 'Success');
    } else {
      this.toastr.success('Profile updated locally. Please login again.', 'Success');
    }

    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
