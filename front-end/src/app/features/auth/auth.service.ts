import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    user: any;
  };
  message?: string;
}

export interface CheckUserResponse {
  success: boolean;
  data?: {
    exists: boolean;
    hasPassword: boolean;
  };
  message?: string;
}

export interface SetPasswordRequest {
  email: string;
  password: string;
}

export interface CreateAdminRequest {
  name: string;
  email: string;
  password: string;
}

export interface CreateAdminResponse {
  success: boolean;
  data?: {
    id: string;
    name: string;
    email: string;
    role: string;
    isTemporaryAdmin?: boolean;
    isEmployeeAccount?: boolean;
  };
  message?: string;
}

export interface ProfileBankDetails {
  bankName: string;
  accountNumber: string;
  ifsc: string;
}

export interface UpdateProfilePayload {
  name?: string;
  newPassword?: string;
  bankDetails?: ProfileBankDetails;
  ownerNotificationsEnabled?: boolean;
  ownerWhatsappNumber?: string;
  whatsappDailyTemplateLimit?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(private http: HttpClient) {}

  login(payload: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', payload);
  }

  checkUser(email: string): Observable<CheckUserResponse> {
    return this.http.post<CheckUserResponse>('/api/auth/check-user', { email });
  }

  setPassword(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/set-password', { email, password });
  }

  createAdmin(payload: CreateAdminRequest): Observable<CreateAdminResponse> {
    return this.http.post<CreateAdminResponse>('/api/auth/admins', payload);
  }

  setToken(token: string): void {
    sessionStorage.setItem('token', token);
    localStorage.removeItem('token');
  }

  getToken(): string | null {
    return sessionStorage.getItem('token');
  }

  clearToken(): void {
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
  }

  saveUser(user: any): void {
    sessionStorage.setItem('user', JSON.stringify(user));
    localStorage.removeItem('user');
  }

  getUser(): any {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  }

  clearUser(): void {
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
  }

  logout(): void {
    this.clearToken();
    this.clearUser();
  }

  updateProfile(data: UpdateProfilePayload): Observable<any> {
    return this.http.put<any>('/api/auth/profile', data);
  }

  getUserRole(): string {
    const user = this.getUser();
    return (user?.role || 'user').toLowerCase();
  }

  isSuperadmin(): boolean {
    return this.getUserRole() === 'superadmin';
  }

  isAdmin(): boolean {
    return this.getUserRole() === 'admin';
  }

  isTemporaryAdmin(): boolean {
    const user = this.getUser();
    return this.isAdmin() && !!user?.isTemporaryAdmin;
  }

  isPrimaryAdmin(): boolean {
    return this.isAdmin() && !this.isTemporaryAdmin();
  }

  isEmployee(): boolean {
    const role = this.getUserRole();
    return role === 'employee' || role === 'user';
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}





