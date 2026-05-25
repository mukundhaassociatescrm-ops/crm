import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [NgIf],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  public displayName = 'Admin';
  public userRole: 'admin' | 'employee' = 'employee';
  public temporaryAdmin = false;

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    const user = this.authService.getUser();
    this.displayName = user?.name || user?.fullName || user?.email?.split('@')[0] || 'Admin';
    this.userRole = this.authService.isAdmin() ? 'admin' : 'employee';
    this.temporaryAdmin = this.authService.isTemporaryAdmin();
  }

  get isAdmin(): boolean {
    return this.userRole === 'admin';
  }

  get isEmployee(): boolean {
    return this.userRole === 'employee';
  }

  get isPrimaryAdmin(): boolean {
    return this.isAdmin && !this.temporaryAdmin;
  }

  get showMyTask(): boolean {
    return this.isEmployee || this.temporaryAdmin;
  }

  public goToMyTask(): void {
    // Temporary admin uses employee task experience.
    if (this.temporaryAdmin || this.isEmployee) {
      this.router.navigate(['employee-dashboard']);
      return;
    }

    this.router.navigate(['manage-task']);
  }

  public nav(route: string) {
    this.router.navigate([route]);
  }
}
