import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService, ProfileBankDetails, UpdateProfilePayload } from '../auth/auth.service';

const DEFAULT_BANK_DETAILS: ProfileBankDetails = {
  bankName: 'State Bank of India, Coimbatore Nagar Branch',
  accountNumber: '44344893154',
  ifsc: 'SBIN0008608',
};

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

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getUser();
    const profileBankDetails = this.currentUser?.bankDetails || DEFAULT_BANK_DETAILS;

    if (this.currentUser) {
      this.profileForm.patchValue({
        name: this.currentUser.name,
        email: this.currentUser.email,
        ownerNotificationsEnabled: !!this.currentUser.ownerNotificationsEnabled,
        ownerWhatsappNumber: this.currentUser.ownerWhatsappNumber || '',
        whatsappDailyTemplateLimit: this.currentUser.whatsappDailyTemplateLimit || 200,
        bankDetails: profileBankDetails,
      });
    }

    if (!this.isAdmin) {
      this.profileForm.get('bankDetails')?.disable({ emitEvent: false });
    }
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
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

    if (this.isAdmin) {
      payload.bankDetails = this.bankDetailsValue;
      payload.ownerNotificationsEnabled = !!this.profileForm.get('ownerNotificationsEnabled')?.value;
      payload.ownerWhatsappNumber = String(this.profileForm.get('ownerWhatsappNumber')?.value || '').trim();
      const limit = Number(this.profileForm.get('whatsappDailyTemplateLimit')?.value);
      if (Number.isFinite(limit) && limit > 0) {
        payload.whatsappDailyTemplateLimit = limit;
      }
    }

    this.authService.updateProfile(payload).subscribe({
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
        this.toastr.error(err?.error?.message || 'Update failed. Please try again.', 'Error');
      }
    });
  }

  private applyProfileUpdate(name: string, persistedToApi: boolean, profileData?: Partial<UpdateProfilePayload>): void {
    const updatedUser = {
      ...this.currentUser,
      name,
      bankDetails: profileData?.bankDetails || this.currentUser?.bankDetails || DEFAULT_BANK_DETAILS,
      ownerNotificationsEnabled: profileData?.ownerNotificationsEnabled ?? this.currentUser?.ownerNotificationsEnabled,
      ownerWhatsappNumber: profileData?.ownerWhatsappNumber ?? this.currentUser?.ownerWhatsappNumber,
    };

    this.authService.saveUser(updatedUser);
    this.currentUser = updatedUser;
    this.saving = false;
    this.profileForm.patchValue({
      name,
      newPassword: '',
      confirmPassword: '',
      ownerNotificationsEnabled: !!updatedUser.ownerNotificationsEnabled,
      ownerWhatsappNumber: updatedUser.ownerWhatsappNumber || '',
      whatsappDailyTemplateLimit: updatedUser.whatsappDailyTemplateLimit || 200,
      bankDetails: updatedUser.bankDetails,
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
