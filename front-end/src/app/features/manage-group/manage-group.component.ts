import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroupService, Group, GroupContact, GroupMember } from './group.service';
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
  groups: Group[] = [];
  editingGroupId: string | null = null;
  selectedGroupId: string | null = null;
  searchText = '';
  showDeleteModal = false;
  deleteGroupId: string | null = null;
  isLoading = false;
  isSaving = false;
  isLoadingMembers = false;
  isRemovingMember = false;
  memberSearchText = '';
  members: GroupMember[] = [];
  memberPage = 1;
  memberLimit = 25;
  memberTotal = 0;
  memberTotalPages = 1;
  showAddClientsModal = false;
  addClientSearchText = '';
  availableClients: Client[] = [];
  selectedClientIds = new Set<string>();
  addClientPage = 1;
  addClientLimit = 25;
  addClientTotal = 0;
  addClientTotalPages = 1;
  isLoadingAvailableClients = false;
  isAddingClients = false;
  private pendingCreatedGroupName: string | null = null;
  private groupSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private memberSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private addClientSearchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private groupService: GroupService,
    private clientService: ClientService,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadGroups();
  }

  get selectedGroup(): Group | null {
    return this.groups.find((group) => group._id === this.selectedGroupId) || null;
  }

  get filteredGroups(): Group[] {
    return this.groups;
  }

  get selectedGroupMemberCount(): number {
    return this.selectedGroup?.memberCount ?? 0;
  }

  get selectedGroupClientCount(): number {
    return this.selectedGroup?.clientCount ?? this.selectedGroup?.actualClientCount ?? 0;
  }

  get selectedGroupContactCount(): number {
    return this.selectedGroup?.contactCount ?? this.selectedGroup?.contacts?.length ?? 0;
  }

  get isFormValid(): boolean {
    return !!this.groupName.trim();
  }

  loadGroups(): void {
    this.isLoading = true;
    this.groupService.getGroups(this.searchText.trim()).subscribe({
      next: (response) => {
        let loadedGroups: Group[] = [];
        if (response.success && response.data) {
          loadedGroups = Array.isArray(response.data) ? response.data : [response.data];
          this.groups = loadedGroups.map(group => ({
            ...group,
            contacts: group.contacts || [],
            numbers: group.numbers || (group.contacts || []).map(c => c.phone)
          }));
        } else {
          this.groups = [];
        }

        if (this.pendingCreatedGroupName) {
          const matched = this.groups.find((group) => group.name.trim().toLowerCase() === this.pendingCreatedGroupName);
          this.selectedGroupId = matched?._id || null;
          this.pendingCreatedGroupName = null;
          if (matched) {
            this.patchFormFromGroup(matched);
            this.loadMembers();
          }
        } else if (!this.selectedGroupId && this.groups.length > 0) {
          this.selectGroup(this.groups[0]);
        } else if (this.selectedGroupId) {
          const current = this.selectedGroup;
          if (current) {
            this.patchFormFromGroup(current);
          }
        }

        if (this.selectedGroupId && !this.groups.some(group => group._id === this.selectedGroupId)) {
          this.selectedGroupId = null;
          this.resetForm();
          this.members = [];
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

  onGroupSearch(): void {
    if (this.groupSearchTimer) {
      clearTimeout(this.groupSearchTimer);
    }
    this.groupSearchTimer = setTimeout(() => this.loadGroups(), 250);
  }

  selectGroup(group: Group): void {
    if (!group._id) {
      return;
    }
    this.selectedGroupId = group._id;
    this.patchFormFromGroup(group);
    this.memberPage = 1;
    this.loadMembers();
  }

  startCreateGroup(): void {
    this.selectedGroupId = null;
    this.members = [];
    this.memberTotal = 0;
    this.memberTotalPages = 1;
    this.resetForm();
  }

  private isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^\d{10,}$/;
    return phoneRegex.test(phone);
  }

  handleContactInput(event: KeyboardEvent): void {
    const input = (event.target as HTMLInputElement).value.trim();

    if (event.key === 'Enter') {
      event.preventDefault();
      this.addContactNumber(input);
      return;
    }

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

  removeNumber(index: number): void {
    this.numbers.splice(index, 1);
  }

  saveGroup(): void {
    if (this.isSaving) {
      return;
    }

    if (!this.groupName.trim()) {
      this.toastr.error('Group name is required');
      return;
    }

    const contacts: GroupContact[] = this.numbers.map(phone => ({
      name: '',
      phone
    }));

    const groupData = {
      name: this.groupName,
      contacts,
    };

    this.isSaving = true;

    if (this.editingGroupId !== null) {
      this.groupService.updateGroup(this.editingGroupId, groupData).subscribe({
        next: (response) => {
          this.isSaving = false;
          if (response.success) {
            this.toastr.success('Group updated successfully');
            this.selectedGroupId = this.editingGroupId;
            this.loadGroups();
            this.loadMembers();
          }
        },
        error: (error) => {
          this.isSaving = false;
          console.error('Failed to update group', error);
          this.toastr.error(error.error?.message || 'Failed to update group');
        }
      });
    } else {
      this.groupService.createGroup(groupData).subscribe({
        next: (response) => {
          this.isSaving = false;
          if (response.success) {
            this.toastr.success('Group created successfully');
            this.pendingCreatedGroupName = groupData.name.trim().toLowerCase();
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

  private patchFormFromGroup(group: Group): void {
    this.groupName = group.name;
    this.numbers = (group.contacts || []).map(c => c.phone);
    this.editingGroupId = group._id || null;
    this.contactInput = '';
    this.contactInputError = '';
  }

  resetForm(): void {
    this.groupName = '';
    this.numbers = [];
    this.contactInput = '';
    this.contactInputError = '';
    this.editingGroupId = null;
  }

  loadMembers(): void {
    if (!this.selectedGroupId) {
      return;
    }

    this.isLoadingMembers = true;
    this.groupService.getGroupMembers(this.selectedGroupId, {
      search: this.memberSearchText.trim() || undefined,
      page: this.memberPage,
      limit: this.memberLimit,
    }).subscribe({
      next: (response) => {
        this.isLoadingMembers = false;
        if (!response.success) {
          this.members = [];
          this.toastr.error(response.message || 'Failed to load group members');
          return;
        }

        this.members = response.data || [];
        this.memberTotal = response.pagination.total;
        this.memberTotalPages = response.pagination.totalPages || 1;
      },
      error: () => {
        this.isLoadingMembers = false;
        this.members = [];
        this.toastr.error('Failed to load group members');
      }
    });
  }

  onMemberSearch(): void {
    if (this.memberSearchTimer) {
      clearTimeout(this.memberSearchTimer);
    }
    this.memberSearchTimer = setTimeout(() => {
      this.memberPage = 1;
      this.loadMembers();
    }, 300);
  }

  goToMemberPage(page: number): void {
    if (page < 1 || page > this.memberTotalPages || page === this.memberPage) {
      return;
    }
    this.memberPage = page;
    this.loadMembers();
  }

  isSelectedGroup(group: Group): boolean {
    return !!group._id && this.selectedGroupId === group._id;
  }

  getGroupCount(group: Group): number {
    return group.memberCount ?? group.actualClientCount ?? group.numbers?.length ?? group.contacts?.length ?? 0;
  }

  openDeleteModal(group: Group): void {
    this.deleteGroupId = group._id || null;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deleteGroupId = null;
  }

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
            this.members = [];
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

  openAddClientsModal(): void {
    if (!this.selectedGroupId) {
      this.toastr.error('Select a group first');
      return;
    }

    this.showAddClientsModal = true;
    this.addClientSearchText = '';
    this.selectedClientIds.clear();
    this.addClientPage = 1;
    this.loadAvailableClients();
  }

  closeAddClientsModal(): void {
    this.showAddClientsModal = false;
    this.availableClients = [];
    this.selectedClientIds.clear();
  }

  loadAvailableClients(): void {
    if (!this.selectedGroupId) {
      return;
    }

    this.isLoadingAvailableClients = true;
    this.clientService.getClients({
      search: this.addClientSearchText.trim() || undefined,
      page: this.addClientPage,
      limit: this.addClientLimit,
      sort: 'desc',
      excludeGroup: this.selectedGroupId,
    }).subscribe({
      next: (response) => {
        this.isLoadingAvailableClients = false;
        if (!response.success) {
          this.availableClients = [];
          this.toastr.error(response.message || 'Failed to load clients');
          return;
        }
        this.availableClients = response.data;
        this.addClientTotal = response.pagination.total;
        this.addClientTotalPages = response.pagination.totalPages || 1;
      },
      error: () => {
        this.isLoadingAvailableClients = false;
        this.availableClients = [];
        this.toastr.error('Failed to load clients');
      }
    });
  }

  onAddClientSearch(): void {
    if (this.addClientSearchTimer) {
      clearTimeout(this.addClientSearchTimer);
    }
    this.addClientSearchTimer = setTimeout(() => {
      this.addClientPage = 1;
      this.loadAvailableClients();
    }, 300);
  }

  goToAddClientPage(page: number): void {
    if (page < 1 || page > this.addClientTotalPages || page === this.addClientPage) {
      return;
    }
    this.addClientPage = page;
    this.loadAvailableClients();
  }

  toggleClientSelection(clientId: string | undefined): void {
    if (!clientId) {
      return;
    }

    if (this.selectedClientIds.has(clientId)) {
      this.selectedClientIds.delete(clientId);
      return;
    }

    this.selectedClientIds.add(clientId);
  }

  isClientSelected(clientId: string | undefined): boolean {
    return !!clientId && this.selectedClientIds.has(clientId);
  }

  addSelectedClients(): void {
    if (!this.selectedGroupId || this.selectedClientIds.size === 0) {
      return;
    }

    this.isAddingClients = true;
    this.groupService.addClientsToGroup(this.selectedGroupId, Array.from(this.selectedClientIds)).subscribe({
      next: (response) => {
        this.isAddingClients = false;
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to add clients');
          return;
        }

        this.toastr.success(`${this.selectedClientIds.size} client(s) added to group`);
        this.closeAddClientsModal();
        this.loadGroups();
        this.loadMembers();
      },
      error: (error) => {
        this.isAddingClients = false;
        this.toastr.error(error.error?.message || 'Failed to add clients');
      }
    });
  }

  removeMember(member: GroupMember): void {
    if (!this.selectedGroupId) {
      return;
    }

    if (member.type === 'contact') {
      this.numbers = this.numbers.filter((number) => number !== member.phone);
      this.saveGroup();
      return;
    }

    this.isRemovingMember = true;
    this.groupService.removeClientFromGroup(this.selectedGroupId, member.id).subscribe({
      next: (response) => {
        this.isRemovingMember = false;
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to remove client');
          return;
        }
        this.toastr.success('Client removed from group');
        this.loadGroups();
        this.loadMembers();
      },
      error: (error) => {
        this.isRemovingMember = false;
        this.toastr.error(error.error?.message || 'Failed to remove client');
      }
    });
  }

  formatDate(value?: string): string {
    if (!value) {
      return '-';
    }
    return new Date(value).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
