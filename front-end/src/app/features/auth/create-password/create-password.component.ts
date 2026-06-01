import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../auth.service';
import { PENDING_PASSWORD_RESET_KEY } from '../../../core/pending-password-reset.guard';

@Component({
  selector: 'app-create-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-password.component.html',
  styleUrls: ['./create-password.component.scss', '../login/login.component.scss'],
})
export class CreatePasswordComponent implements OnInit {
  readonly email: string;
  showPassword = false;
  loading = false;
  errorMessage = '';

  readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(5)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(5)]],
    },
    { validators: (group) => this.passwordMatchValidator(group) },
  );

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly toastr: ToastrService,
  ) {
    this.email = String(sessionStorage.getItem(PENDING_PASSWORD_RESET_KEY) || '').trim();
  }

  ngOnInit(): void {
    if (!this.email) {
      this.router.navigate(['/login']);
    }
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    this.errorMessage = '';

    if (this.form.invalid) {
      if (this.form.hasError('passwordMismatch')) {
        this.errorMessage = 'Passwords do not match.';
      } else {
        this.errorMessage = 'Password must be at least 5 characters.';
      }
      return;
    }

    this.loading = true;
    const password = String(this.form.value.password || '');
    const confirmPassword = String(this.form.value.confirmPassword || '');

    this.authService.createPassword(this.email, password, confirmPassword).subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.success) {
          this.errorMessage = response.message || 'Failed to update password.';
          return;
        }

        sessionStorage.removeItem(PENDING_PASSWORD_RESET_KEY);
        this.authService.clearToken();
        this.authService.clearUser();
        this.toastr.success('Password updated successfully. Please sign in.', 'Success');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || 'Failed to update password.';
      },
    });
  }

  goToLogin(): void {
    sessionStorage.removeItem(PENDING_PASSWORD_RESET_KEY);
    this.router.navigate(['/login']);
  }

  private passwordMatchValidator(group: { get: (name: string) => { value?: string } | null }): { [key: string]: boolean } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    return password && confirmPassword && password !== confirmPassword
      ? { passwordMismatch: true }
      : null;
  }
}
