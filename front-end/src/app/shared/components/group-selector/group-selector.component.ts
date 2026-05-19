import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Group, GroupService } from '../../../features/manage-group/group.service';

@Component({
  selector: 'app-group-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-selector.component.html',
  styleUrl: './group-selector.component.scss',
})
export class GroupSelectorComponent implements OnInit {
  @Input() label = 'Select Group';
  @Input() disabled = false;
  @Input() helperText = 'Choose the audience group for this send.';
  @Output() groupChange = new EventEmitter<Group | null>();

  groups: Group[] = [];
  selectedGroup: Group | null = null;
  isLoadingGroups = false;

  constructor(
    private readonly groupService: GroupService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadGroups();
  }

  get hasGroups(): boolean {
    return this.groups.length > 0;
  }

  get selectedGroupMemberCount(): number {
    return this.getGroupMemberCount(this.selectedGroup);
  }

  getGroupMemberCount(group: Group | null | undefined): number {
    if (!group) {
      return 0;
    }

    return group.numbers?.length || group.contacts?.length || 0;
  }

  onGroupChange(): void {
    this.groupChange.emit(this.selectedGroup);
  }

  private loadGroups(): void {
    this.isLoadingGroups = true;
    this.groupService.getGroups().subscribe({
      next: (response) => {
        this.isLoadingGroups = false;
        if (!response.success || !response.data) {
          this.groups = [];
          return;
        }

        const groups = Array.isArray(response.data) ? response.data : [response.data];
        this.groups = groups.map((group) => ({
          ...group,
          contacts: group.contacts || [],
          numbers: group.numbers || (group.contacts || []).map((contact) => contact.phone),
        }));
      },
      error: () => {
        this.isLoadingGroups = false;
        this.groups = [];
        this.toastr.error('Failed to load groups', 'Error');
      },
    });
  }
}
