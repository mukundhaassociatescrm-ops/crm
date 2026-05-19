import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupContact } from './group.service';
import { ClientService, Client } from '../manage-client/client.service';
import { ToastrService } from 'ngx-toastr';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

@Component({
  selector: 'app-manage-group',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-group.component.html',
  styleUrl: './manage-group.component.scss'
})
export class ManageGroupComponent implements OnInit {
  groupName = '';
  contactInput = '';
  contactInputError = '';
  numbers: string[] = [];
  selectedClients: string[] = [];
  groups: Group[] = [];
  clients: Client[] = [];
  editingIndex: number | null = null;
  editingGroupId: string | null = null;
  selectedGroupId: string | null = null;
  searchText = '';
  showDeleteModal = false;
  deleteIndex: number | null = null;
  deleteGroupId: string | null = null;
  isLoading = false;
  isSaving = false;
  isLoadingClients = false;
  private pendingCreatedGroup: { name: string; numbers: string[]; clients: string[] } | null = null;

  constructor(
    private groupService: GroupService,
    private clientService: ClientService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadClients();
    this.loadGroups();
  }

  /**
   * Load all clients from API
   */
  loadClients(): void {
    this.isLoadingClients = true;
    this.clientService.getClients({ limit: 1000 }).subscribe({
      next: (response) => {
        if (response.success) {
          this.clients = response.data;
        }
        this.isLoadingClients = false;
      },
      error: () => {
        this.toastr.error('Failed to load clients');
        this.isLoadingClients = false;
      }
    });
  }

  /**
   * Load all groups from API
   */
  loadGroups(): void {
    this.isLoading = true;
    this.groupService.getGroups().subscribe({
      next: (response) => {
        let loadedGroups: Group[] = [];
        if (response.success && response.data) {
          loadedGroups = Array.isArray(response.data) ? response.data : [response.data];
          // Map contacts to numbers for UI compatibility
          this.groups = loadedGroups.map(group => ({
            ...group,
            numbers: group.contacts.map(c => c.phone)
          }));
        } else {
          this.groups = [];
        }

        if (this.pendingCreatedGroup) {
          const matched = this.findMatchingGroup(this.pendingCreatedGroup.name, this.pendingCreatedGroup.numbers);
          this.selectedGroupId = matched?._id || null;
          this.pendingCreatedGroup = null;
        }

        if (this.selectedGroupId && !this.groups.some(group => group._id === this.selectedGroupId)) {
          this.selectedGroupId = null;
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Failed to load groups', error);
        this.toastr.error('Failed to load groups');
        this.isLoading = false;
        this.isSaving = false;
      }
    });
  }

  /**
   * Validate phone number format
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Only digits, minimum 10 characters
    const phoneRegex = /^\d{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Handle contact input on Enter or comma press
   */
  handleContactInput(event: KeyboardEvent): void {
    const input = (event.target as HTMLInputElement).value.trim();
    
    // Handle Enter key
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addContactNumber(input);
      return;
    }

    // Handle comma key
    if (event.key === ',') {
      event.preventDefault();
      this.addContactNumber(input);
      return;
    }

    // Clear error on any other valid input
    if (this.contactInputError && input.length > 0) {
      this.contactInputError = '';
    }
  }

  /**
   * Add a single contact number with validation
   */
  private addContactNumber(rawInput: string): void {
    const candidates = rawInput
      .split(',')
      .map((item) => item.trim())
      .filter((item) => !!item);

    if (candidates.length === 0) {
      this.contactInputError = 'Please enter a number';
      return;
    }

    const invalid = candidates.find((phone) => !this.isValidPhoneNumber(phone));
    if (invalid) {
      this.contactInputError = 'Invalid number. Must be at least 10 digits';
      return;
    }

    const duplicates = candidates.find((phone) => this.numbers.includes(phone));
    if (duplicates) {
      this.contactInputError = 'This number is already added';
      return;
    }

    this.numbers.push(...candidates);
    this.contactInput = '';
    this.contactInputError = '';
  }

  /**
   * Remove a number from the list
   */
  removeNumber(index: number): void {
    this.numbers.splice(index, 1);
  }

  /**
   * Save or update a group
   */
  saveGroup(): void {
    if (this.isSaving) {
      return;
    }

    if (!this.groupName.trim()) {
      this.toastr.error('Group name is required');
      return;
    }

    // Allow either contacts OR clients
    if (this.numbers.length === 0 && this.selectedClients.length === 0) {
      this.toastr.error('At least one contact or client is required');
      return;
    }

    // Create contacts array from phone numbers
    const contacts: GroupContact[] = this.numbers.map(phone => ({
      name: '',
      phone
    }));

    const groupData = {
      name: this.groupName,
      contacts,
      clients: this.selectedClients
    };

    this.isSaving = true;

    if (this.editingGroupId !== null) {
      // Update existing group
      this.groupService.updateGroup(this.editingGroupId, groupData).subscribe({
        next: (response) => {
          this.isSaving = false;
          if (response.success) {
            this.toastr.success('Group updated successfully');
            this.selectedGroupId = this.editingGroupId;
            this.resetForm();
            this.loadGroups();
          }
        },
        error: (error) => {
          this.isSaving = false;
          console.error('Failed to update group', error);
          this.toastr.error(error.error?.message || 'Failed to update group');
        }
      });
    } else {
      // Create new group
      this.groupService.createGroup(groupData).subscribe({
        next: (response) => {
          this.isSaving = false;
          if (response.success) {
            this.toastr.success('Group created successfully');
            this.pendingCreatedGroup = {
              name: groupData.name,
              numbers: [...this.numbers],
              clients: [...this.selectedClients]
            };
            this.resetForm();
            this.loadGroups();
          }
        },
        error: (error) => {
          this.isSaving = false;
          console.error('Failed to create group', error);
          this.toastr.error(error.error?.message || 'Failed to create group');
        }
      });
    }
  }

  /**
   * Edit a group by index
   */
  editGroup(group: Group): void {
    this.groupName = group.name;
    this.numbers = group.contacts.map(c => c.phone);
    const clientIds = group.clients?.map(c => (typeof c === 'string' ? c : c._id || '')) || [];
    this.selectedClients = clientIds;
    this.editingIndex = this.groups.findIndex((item) => item._id === group._id);
    this.editingGroupId = group._id || null;
    this.selectedGroupId = group._id || null;
  }

  /**
   * Reset form to initial state
   */
  resetForm(): void {
    this.groupName = '';
    this.numbers = [];
    this.selectedClients = [];
    this.contactInput = '';
    this.contactInputError = '';
    this.editingIndex = null;
    this.editingGroupId = null;
  }

  /**
   * Toggle client selection
   */
  toggleClientSelection(clientId: string): void {
    if (this.selectedClients.includes(clientId)) {
      this.selectedClients = this.selectedClients.filter(id => id !== clientId);
    } else {
      this.selectedClients.push(clientId);
    }
  }

  /**
   * Check if a client is selected
   */
  isClientSelected(clientId: string | undefined): boolean {
    return clientId ? this.selectedClients.includes(clientId) : false;
  }

  /**
   * Get selected clients names
   */
  getSelectedClientNames(): string {
    if (this.selectedClients.length === 0) return 'No clients selected';
    return this.clients
      .filter(c => c._id && this.selectedClients.includes(c._id))
      .map(c => c.name)
      .join(', ');
  }

  get isFormValid(): boolean {
    return !!this.groupName.trim() && this.numbers.length > 0;
  }

  isSelectedGroup(group: Group): boolean {
    return !!group._id && this.selectedGroupId === group._id;
  }

  /**
   * Get filtered groups based on search text
   */
  filteredGroups(): Group[] {
    return this.groups.filter(g =>
      g.name.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  /**
   * Open delete confirmation modal
   */
  openDeleteModal(group: Group): void {
    this.deleteIndex = this.groups.findIndex((item) => item._id === group._id);
    this.deleteGroupId = group._id || null;
    this.showDeleteModal = true;
  }

  /**
   * Close delete confirmation modal
   */
  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deleteIndex = null;
    this.deleteGroupId = null;
  }

  /**
   * Confirm and execute group deletion
   */
  confirmDelete(): void {
    if (this.deleteGroupId === null) {
      return;
    }

    this.groupService.deleteGroup(this.deleteGroupId).subscribe({
      next: (response) => {
        if (response.success) {
          this.toastr.success('Group deleted successfully');
          if (this.selectedGroupId === this.deleteGroupId) {
            this.selectedGroupId = null;
            this.resetForm();
          }
          this.closeDeleteModal();
          this.loadGroups();
        }
      },
      error: (error) => {
        console.error('Failed to delete group', error);
        this.toastr.error(error.error?.message || 'Failed to delete group');
      }
    });
  }

  private findMatchingGroup(groupName: string, numberList: string[]): Group | undefined {
    const normalizedName = groupName.trim().toLowerCase();
    const normalizedNumbers = [...numberList].sort().join('|');

    return this.groups.find((group) => {
      const groupNumbers = group.contacts.map((contact) => contact.phone).sort().join('|');
      return group.name.trim().toLowerCase() === normalizedName && groupNumbers === normalizedNumbers;
    });
  }
}
