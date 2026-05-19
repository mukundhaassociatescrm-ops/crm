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
      return bySearch && byStatus;
    });
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

