import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

export const PENDING_PASSWORD_RESET_KEY = 'pendingPasswordReset';

@Injectable({
  providedIn: 'root',
})
export class PendingPasswordResetGuard implements CanActivate {
  constructor(private readonly router: Router) {}

  canActivate(): boolean {
    const email = String(sessionStorage.getItem(PENDING_PASSWORD_RESET_KEY) || '').trim();
    if (!email) {
      this.router.navigate(['/login']);
      return false;
    }

    return true;
  }
}
