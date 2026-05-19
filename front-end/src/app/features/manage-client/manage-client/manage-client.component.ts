import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ClientService, Client } from '../client.service';
import { GroupService, Group } from '../../manage-group/group.service';
import { FullscreenToggleComponent } from '../../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

@Component({
  selector: 'app-manage-client',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-client.component.html',
  styleUrl: './manage-client.component.scss',
})
export class ManageClientComponent implements OnInit {
  // ─── State ──────────────────────────────────────────────────────────────────
  clients: Client[] = [];
  groups: Group[] = [];
  isLoading = false;
  isSaving = false;

  // Modal state
  isModalOpen = false;
  isEditMode = false;
  isDeleteModalOpen = false;
  isBulkUploadOpen = false;
  selectedClientId: string | null = null;

  // Filters / pagination
  searchTerm = '';
  currentPage = 1;
  pageSize = 20;
  totalRecords = 0;
  totalPages = 0;
  sortOrder: 'asc' | 'desc' = 'desc';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Bulk upload
  selectedFile: File | null = null;
  bulkResult: { created: number; skipped: number; errors: { row: string; reason: string }[] } | null = null;
  isBulkUploading = false;
  groupSearchTerm = '';

  // Form
  clientForm = this.fb.group({
    name: ['', Validators.required],
    mobile: ['', [Validators.required, Validators.pattern(/^(\+91)?[6-9]\d{9}$/)]],
    alternateMobile: ['', [Validators.pattern(/^(\+91)?[6-9]\d{9}$/)]],
    whatsappOptIn: [true],
    notes: [''],
    groups: [[] as string[]],
  });

  constructor(
    private fb: FormBuilder,
    private clientService: ClientService,
    private groupService: GroupService,
    private toastr: ToastrService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadGroups();
    this.loadClients();
  }

  // ─── Load Groups ────────────────────────────────────────────────────────────────

  loadGroups(): void {
    this.groupService.getGroups().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.groups = Array.isArray(res.data) ? res.data : [res.data];
        }
      },
      error: () => this.toastr.error('Failed to load groups', 'Error'),
    });
  }

  // ─── Load ────────────────────────────────────────────────────────────────────

  loadClients(): void {
    this.isLoading = true;
    this.clientService
      .getClients({
        search: this.searchTerm || undefined,
        page: this.currentPage,
        limit: this.pageSize,
        sort: this.sortOrder,
      })
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res.success) {
            this.clients = res.data;
            this.totalRecords = res.pagination.total;
            this.totalPages = res.pagination.totalPages;
          } else {
            this.toastr.error(res.message || 'Failed to load clients', 'Error');
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.toastr.error(err?.error?.message || 'Failed to load clients', 'Error');
        },
      });
  }

  // ─── Search / filter ─────────────────────────────────────────────────────────

  onSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.currentPage = 1;
      this.loadClients();
    }, 350);
  }

  toggleSort(): void {
    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
    this.currentPage = 1;
    this.loadClients();
  }

  // ─── Pagination ───────────────────────────────────────────────────────────────

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadClients();
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  // ─── Add / Edit Modal ─────────────────────────────────────────────────────────

  openAddModal(): void {
    this.isEditMode = false;
    this.selectedClientId = null;
    this.groupSearchTerm = '';
    this.clientForm.reset({ whatsappOptIn: true, groups: [] });
    this.isModalOpen = true;
  }

  openEditModal(client: Client): void {
    this.isEditMode = true;
    this.selectedClientId = client._id || null;
    this.groupSearchTerm = '';
    const groupIds = client.groups?.map((g) => (typeof g === 'string' ? g : g._id || '')) || [];
    this.clientForm.setValue({
      name: client.name,
      mobile: client.mobile,
      alternateMobile: client.alternateMobile || '',
      whatsappOptIn: client.whatsappOptIn,
      notes: client.notes || '',
      groups: groupIds,
    });
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.groupSearchTerm = '';
    this.clientForm.reset({ whatsappOptIn: true, groups: [] });
  }

  saveClient(): void {
    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      this.toastr.error('Please fill required fields correctly', 'Validation Error');
      return;
    }

    this.isSaving = true;
    const formValue = this.clientForm.value;
    const value = {
      name: formValue.name || '',
      mobile: formValue.mobile || '',
      alternateMobile: formValue.alternateMobile || '',
      whatsappOptIn: formValue.whatsappOptIn || true,
      notes: formValue.notes || '',
      groups: formValue.groups || [],
    } as Omit<Client, '_id' | 'createdAt' | 'updatedAt'>;

    if (this.isEditMode && this.selectedClientId) {
      this.clientService.updateClient(this.selectedClientId, value).subscribe({
        next: (res) => {
          this.isSaving = false;
          if (res.success) {
            this.toastr.success('Client updated', 'Success');
            this.closeModal();
            this.loadClients();
          } else {
            this.toastr.error(res.message || 'Update failed', 'Error');
          }
        },
        error: (err) => {
          this.isSaving = false;
          this.toastr.error(err?.error?.message || 'Something went wrong', 'Error');
        },
      });
    } else {
      this.clientService.createClient(value).subscribe({
        next: (res) => {
          this.isSaving = false;
          if (res.success) {
            this.toastr.success('Client added', 'Success');
            this.closeModal();
            this.loadClients();
          } else {
            this.toastr.error(res.message || 'Failed to add client', 'Error');
          }
        },
        error: (err) => {
          this.isSaving = false;
          this.toastr.error(err?.error?.message || 'Something went wrong', 'Error');
        },
      });
    }
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  openDeleteModal(client: Client): void {
    this.selectedClientId = client._id || null;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen = false;
    this.selectedClientId = null;
  }

  confirmDelete(): void {
    if (!this.selectedClientId) return;
    this.clientService.deleteClient(this.selectedClientId).subscribe({
      next: (res) => {
        if (res.success) {
          this.toastr.success('Client deleted', 'Success');
          this.closeDeleteModal();
          if (this.clients.length === 1 && this.currentPage > 1) this.currentPage--;
          this.loadClients();
        } else {
          this.toastr.error(res.message || 'Delete failed', 'Error');
        }
      },
      error: () => this.toastr.error('Failed to delete client', 'Error'),
    });
  }

  // ─── Open Chat ────────────────────────────────────────────────────────────────

  openChat(client: Client): void {
    this.router.navigate(['/manage-chat'], {
      state: {
        targetPhone: client.mobile,
        startChat: true,
      },
    });
  }

  // ─── Bulk Upload ──────────────────────────────────────────────────────────────

  openBulkUpload(): void {
    this.selectedFile = null;
    this.bulkResult = null;
    this.isBulkUploadOpen = true;
  }

  closeBulkUpload(): void {
    this.isBulkUploadOpen = false;
    this.selectedFile = null;
    this.bulkResult = null;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
    this.bulkResult = null;
  }

  uploadCSV(): void {
    if (!this.selectedFile) {
      this.toastr.error('Please select a CSV file', 'Error');
      return;
    }
    this.isBulkUploading = true;
    this.clientService.bulkUpload(this.selectedFile).subscribe({
      next: (res) => {
        this.isBulkUploading = false;
        if (res.success) {
          this.bulkResult = { created: res.created, skipped: res.skipped, errors: res.errors };
          this.toastr.success(`${res.created} clients imported`, 'Bulk Upload');
          this.loadClients();
        } else {
          this.toastr.error(res.message || 'Upload failed', 'Error');
        }
      },
      error: (err) => {
        this.isBulkUploading = false;
        this.toastr.error(err?.error?.message || 'Upload failed', 'Error');
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  hasError(control: string, error: string): boolean {
    const c = this.clientForm.get(control) as AbstractControl;
    return c?.touched && c?.hasError(error);
  }

  toggleGroupSelection(groupId: string): void {
    const groupsControl = this.clientForm.get('groups') as any;
    const currentGroups = groupsControl.value || [];
    if (currentGroups.includes(groupId)) {
      groupsControl.setValue(currentGroups.filter((id: string) => id !== groupId));
    } else {
      groupsControl.setValue([...currentGroups, groupId]);
    }
  }

  isGroupSelected(groupId: string): boolean {
    const groupsControl = this.clientForm.get('groups') as any;
    return (groupsControl.value || []).includes(groupId);
  }

  get selectedGroupsCount(): number {
    const groupsControl = this.clientForm.get('groups') as any;
    return (groupsControl.value || []).length;
  }

  get filteredGroups(): Group[] {
    const query = this.groupSearchTerm.trim().toLowerCase();
    if (!query) return this.groups;
    return this.groups.filter((group) => group.name.toLowerCase().includes(query));
  }

  getSelectedGroupNames(): string {
    const groupsControl = this.clientForm.get('groups') as any;
    const selectedIds = groupsControl.value || [];
    return this.groups
      .filter((g) => selectedIds.includes(g._id))
      .map((g) => g.name)
      .join(', ') || 'No groups selected';
  }
}
