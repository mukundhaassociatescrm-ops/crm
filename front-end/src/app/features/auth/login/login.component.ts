import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { PENDING_PASSWORD_RESET_KEY } from '../../../core/pending-password-reset.guard';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  public animate = false;
  public errorMessage = '';
  public loading = false;
  
  // Multi-step auth state
  public step: 'email' | 'password' | 'set-password' = 'email';
  public userEmail = '';
  public userExists = false;
  public hasPassword = false;
  public showPassword = false;

  // Forms
  public emailForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  public passwordForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(5)]]
  });

  public setPasswordForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(5)]],
    confirmPassword: ['', [Validators.required, Validators.minLength(5)]]
  }, { validators: this.passwordMatchValidator });

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    setTimeout(() => {
      this.animate = true;
    }, 100);
  }

  // ===== STEP 1: Email Check =====
  checkEmail() {
    this.errorMessage = '';
    
    if (this.emailForm.invalid) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    this.loading = true;
    const email = this.emailForm.value.email?.trim() || '';
    
    this.authService.checkUser(email).subscribe({
      next: (response) => {
        this.loading = false;
        
        if (!response.success) {
          this.errorMessage = 'Unable to verify email. Please try again.';
          return;
        }

        this.userEmail = email;
        
        if (!response.data?.exists) {
          this.errorMessage = 'User account not found.';
          return;
        }

        this.userExists = true;
        this.hasPassword = response.data.hasPassword || false;

        if (response.data.mustCreatePassword) {
          sessionStorage.setItem(PENDING_PASSWORD_RESET_KEY, email);
          this.router.navigate(['/create-password']);
          return;
        }

        if (this.hasPassword) {
          this.step = 'password';
        } else {
          this.step = 'set-password';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = 'Unable to verify email. Please try again.';
      }
    });
  }

  // ===== STEP 2: Login with Password =====
  login() {
    this.errorMessage = '';

    if (this.passwordForm.invalid) {
      this.errorMessage = 'Please enter your password.';
      return;
    }

    this.loading = true;
    const payload = {
      email: this.userEmail,
      password: this.passwordForm.value.password || ''
    };

    this.authService.login(payload).subscribe({
      next: (response) => {
        this.loading = false;
        if (response?.success && response?.data?.token) {
          this.authService.setToken(response.data.token);
          if (response.data.user) {
            this.authService.saveUser(response.data.user);
          }
          this.router.navigate([this.getPostLoginRoute(response.data.user)]);
        } else {
          this.errorMessage = response?.message || 'Login failed. Please try again.';
        }
      },
      error: (err) => {
        this.loading = false;
        if (err?.status === 401) {
          this.errorMessage = 'Invalid password.';
        } else {
          this.errorMessage = 'Login failed. Please try again.';
        }
      }
    });
  }

  // ===== STEP 3: Set Password =====
  setPassword() {
    this.errorMessage = '';

    if (this.setPasswordForm.invalid) {
      if (this.setPasswordForm.hasError('passwordMismatch')) {
        this.errorMessage = 'Passwords do not match.';
      } else {
        this.errorMessage = 'Password must be at least 5 characters.';
      }
      return;
    }

    this.loading = true;
    const password = this.setPasswordForm.value.password || '';

    this.authService.setPassword(this.userEmail, password).subscribe({
      next: (response) => {
        this.loading = false;
        if (response?.success && response?.data?.token) {
          this.authService.setToken(response.data.token);
          if (response.data.user) {
            this.authService.saveUser(response.data.user);
          }
          this.router.navigate([this.getPostLoginRoute(response.data.user)]);
        } else {
          this.errorMessage = response?.message || 'Failed to set password. Please try again.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = 'Failed to set password. Please try again.';
      }
    });
  }

  // ===== Utility Methods =====
  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  goBack() {
    if (this.step === 'password' || this.step === 'set-password') {
      this.step = 'email';
      this.errorMessage = '';
      this.passwordForm.reset();
      this.setPasswordForm.reset();
    }
  }

  private getPostLoginRoute(user: any): string {
    return String(user?.role || '').toLowerCase() === 'superadmin'
      ? '/superadmin/create-admin'
      : '/dashboard';
  }

  private passwordMatchValidator(group: any): { [key: string]: any } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    
    return password && confirmPassword && password !== confirmPassword 
      ? { passwordMismatch: true } 
      : null;
  }
}

