import { CommonModule, DatePipe } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { TaskService, UpcomingReminder } from '../manage-task/task.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

type ReminderFilter = 'all' | 'upcoming' | 'overdue' | 'sent';

@Component({
  selector: 'app-task-reminders',
  standalone: true,
  imports: [CommonModule, DatePipe, FullscreenToggleComponent],
  templateUrl: './task-reminders.component.html',
  styleUrl: './task-reminders.component.scss'
})
export class TaskRemindersComponent implements OnInit, OnDestroy {
  reminders: UpcomingReminder[] = [];
  loading = true;
  lastUpdated: Date | null = null;
  activeFilter: ReminderFilter = 'all';
  refreshing = false;
  activeMenuId: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly taskService: TaskService,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    interval(30000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.loading = this.reminders.length === 0;
          return this.taskService.getUpcomingReminders();
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          this.reminders = response.data ?? [];
          this.lastUpdated = new Date();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.toastr.error('Failed to refresh reminders', 'Error');
        }
      });
  }

  get filteredReminders(): UpcomingReminder[] {
    if (this.activeFilter === 'all') {
      return this.reminders;
    }

    return this.reminders.filter((reminder) => reminder.reminderStatus === this.activeFilter);
  }

  setFilter(filter: ReminderFilter): void {
    this.activeFilter = filter;
  }

  refreshNow(): void {
    this.refreshing = true;
    this.taskService.getUpcomingReminders().subscribe({
      next: (response) => {
        this.reminders = response.data ?? [];
        this.lastUpdated = new Date();
        this.loading = false;
        this.refreshing = false;
      },
      error: () => {
        this.refreshing = false;
        this.loading = false;
        this.toastr.error('Failed to refresh reminders', 'Error');
      }
    });
  }

  getFilterCount(filter: ReminderFilter): number {
    if (filter === 'all') {
      return this.reminders.length;
    }

    return this.reminders.filter((reminder) => reminder.reminderStatus === filter).length;
  }

  toggleMenu(taskId: string): void {
    this.activeMenuId = this.activeMenuId === taskId ? null : taskId;
  }

  createTaskFromEnquiry(reminder: UpcomingReminder): void {
    this.activeMenuId = null;
    const enquiryId = reminder.taskId.replace('enquiry-', '');
    // Phone is stored in assignedUser for enquiries
    this.router.navigate(['/manage-task'], {
      queryParams: {
        customerName: reminder.taskName.replace('New Enquiry: ', ''),
        customerPhone: reminder.assignedUser,
        fromEnquiry: enquiryId
      }
    });
  }

  removeEnquiry(reminder: UpcomingReminder): void {
    this.activeMenuId = null;
    const enquiryId = reminder.taskId.replace('enquiry-', '');
    this.taskService.dismissEnquiry(enquiryId).subscribe({
      next: () => {
        this.reminders = this.reminders.filter((r) => r.taskId !== reminder.taskId);
        this.toastr.success('Enquiry removed.', 'Done');
      },
      error: () => {
        this.toastr.error('Failed to remove enquiry.', 'Error');
      }
    });
  }

  @HostListener('document:click')
  closeMenuOnOutsideClick(): void {
    this.activeMenuId = null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByTaskId(_index: number, reminder: UpcomingReminder): string {
    return reminder.taskId;
  }

  isEnquiry(reminder: UpcomingReminder): boolean {
    return reminder.kind === 'enquiry';
  }

  getStatusLabel(reminder: UpcomingReminder): string {
    if (reminder.overdue) {
      return 'Overdue';
    }

    if (reminder.reminderSent) {
      return 'Sent';
    }

    return 'Upcoming';
  }

  isOverdue(reminder: UpcomingReminder): boolean {
    return reminder.overdue;
  }
}
