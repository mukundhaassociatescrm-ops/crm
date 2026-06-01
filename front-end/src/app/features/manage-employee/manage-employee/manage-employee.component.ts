import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { EmployeeService, Employee } from '../employee.service';
import { FullscreenToggleComponent } from '../../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

@Component({
  selector: 'app-manage-employee',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-employee.component.html',
  styleUrl: './manage-employee.component.scss'
})
export class ManageEmployeeComponent {
  isDeleteModalOpen = false;
  isResetPasswordModalOpen = false;
  isResettingPassword = false;
  resetPasswordEmployee: Employee | null = null;
  isModalOpen = false;
  isEditMode = false;
  isLoading = false;
  isSaving = false;
  message = '';
  messageType: 'success' | 'error' = 'success';
  selectedEmployeeId: string | null = null;

  employees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  searchTerm = '';
  statusFilter = '';
  activeEmployeeKpi: 'all' | 'active' | 'inactive' | 'admin' = 'all';

  employeeForm = this.fb.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    address: ['', Validators.required],
    role: ['', Validators.required],
    status: [true, Validators.required]
  });

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.loadEmployees();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isResetPasswordModalOpen) {
      this.closeResetPasswordModal();
      return;
    }
    if (this.isModalOpen) {
      this.closeModal();
    }
  }

  loadEmployees() {
    this.isLoading = true;
    this.employeeService.getEmployees().subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.success && Array.isArray(res.data)) {
          this.employees = res.data as Employee[];
          this.applyFilters();
        } else {
          this.showMessage(res.message || 'Failed to load employees', 'error');
        }
      },
      error: () => {
        this.isLoading = false;
        this.showMessage('Failed to load employees', 'error');
      }
    });
  }

  applyFilters() {
    this.filteredEmployees = this.employees.filter((emp) => {
      const bySearch =
        !this.searchTerm ||
        emp.fullName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(this.searchTerm.toLowerCase());
      const byStatus =
        !this.statusFilter ||
        this.statusFilter === '' ||
        (this.statusFilter === 'Active' && emp.status === true) ||
        (this.statusFilter === 'Inactive' && emp.status === false);
      const byKpi = this.matchesEmployeeKpi(emp);
      return bySearch && byStatus && byKpi;
    });
  }

  get employeeStats() {
    return {
      total: this.employees.length,
      active: this.employees.filter((emp) => emp.status).length,
      inactive: this.employees.filter((emp) => !emp.status).length,
      admins: this.employees.filter((emp) => String(emp.role || '').toLowerCase() === 'admin').length,
    };
  }

  applyEmployeeKpi(kpi: 'all' | 'active' | 'inactive' | 'admin'): void {
    this.activeEmployeeKpi = kpi;
    if (kpi === 'all') {
      this.statusFilter = '';
    } else if (kpi === 'active') {
      this.statusFilter = 'Active';
    } else if (kpi === 'inactive') {
      this.statusFilter = 'Inactive';
    } else if (kpi === 'admin') {
      this.statusFilter = '';
    }
    this.applyFilters();
  }

  private matchesEmployeeKpi(emp: Employee): boolean {
    if (this.activeEmployeeKpi === 'all') {
      return true;
    }
    if (this.activeEmployeeKpi === 'active') {
      return emp.status === true;
    }
    if (this.activeEmployeeKpi === 'inactive') {
      return emp.status === false;
    }
    if (this.activeEmployeeKpi === 'admin') {
      return String(emp.role || '').toLowerCase() === 'admin';
    }
    return true;
  }

  openAddModal() {
    this.isEditMode = false;
    this.selectedEmployeeId = null;
    this.employeeForm.reset({ status: true });
    this.isModalOpen = true;
  }

  openEditModal(employee: Employee) {
    this.isEditMode = true;
    this.selectedEmployeeId = employee._id || null;
    this.employeeForm.setValue({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      address: employee.address,
      role: employee.role,
      status: !!employee.status
    });
    this.isModalOpen = true;
  }

  closeModal() {
    this.isModalOpen = false;
  }

  openDeleteModal(employee: Employee) {
    this.selectedEmployeeId = employee._id || null;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
  }

  openResetPasswordModal(employee: Employee) {
    this.resetPasswordEmployee = employee;
    this.isResetPasswordModalOpen = true;
  }

  closeResetPasswordModal() {
    if (this.isResettingPassword) {
      return;
    }
    this.isResetPasswordModalOpen = false;
    this.resetPasswordEmployee = null;
  }

  confirmResetPassword() {
    const employeeId = this.resetPasswordEmployee?._id;
    if (!employeeId) {
      return;
    }

    this.isResettingPassword = true;
    this.employeeService.resetPassword(employeeId).subscribe({
      next: (res) => {
        this.isResettingPassword = false;
        if (res.success) {
          this.showMessage(res.message || 'Password reset requested.', 'success');
          this.closeResetPasswordModal();
          this.loadEmployees();
        } else {
          this.showMessage(res.message || 'Failed to reset password', 'error');
        }
      },
      error: (err) => {
        this.isResettingPassword = false;
        this.showMessage(err?.error?.message || 'Failed to reset password', 'error');
      },
    });
  }

  saveEmployee() {
    if (this.employeeForm.invalid) {
      this.showMessage('Please fill required fields correctly', 'error');
      return;
    }

    this.isSaving = true;
    const employee = {
      ...this.employeeForm.value,
      status: !!this.employeeForm.value.status
    } as Employee;

    if (this.isEditMode && this.selectedEmployeeId) {
      this.employeeService.updateEmployee(this.selectedEmployeeId, employee).subscribe({
        next: (res) => {
          this.isSaving = false;
          if (res.success) {
            this.showMessage('Employee updated successfully', 'success');
            this.closeModal();
            this.loadEmployees();
          } else {
            this.showMessage(res.message || 'Failed to update employee', 'error');
          }
        },
        error: (err) => {
          this.isSaving = false;
          this.showMessage(err?.error?.message || 'Something went wrong', 'error');
        }
      });
    } else {
      this.employeeService.addEmployee(employee).subscribe({
        next: (res) => {
          this.isSaving = false;
          if (res.success) {
            this.showMessage('Employee added successfully', 'success');
            this.closeModal();
            this.loadEmployees();
          } else {
            this.showMessage(res.message || 'Failed to add employee', 'error');
          }
        },
        error: (err) => {
          this.isSaving = false;
          this.showMessage(err?.error?.message || 'Something went wrong', 'error');
        }
      });
    }
  }

  confirmDelete() {
    if (!this.selectedEmployeeId) {
      return;
    }
    this.employeeService.deleteEmployee(this.selectedEmployeeId).subscribe({
      next: (res) => {
        if (res.success) {
          this.showMessage('Employee deleted', 'success');
          this.closeDeleteModal();
          this.loadEmployees();
        } else {
          this.showMessage(res.message || 'Failed to delete employee', 'error');
        }
      },
      error: () => {
        this.showMessage('Failed to delete employee', 'error');
      }
    });
  }

  onStatusToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    this.employeeForm.patchValue({ status: target.checked });
  }

  showMessage(message: string, type: 'success' | 'error') {
    this.message = message;
    this.messageType = type;
    if (type === 'success') {
      this.toastr.success(message, 'Success');
    } else {
      this.toastr.error(message, 'Error');
    }
  }
}

