import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { Task, TaskAttachment, TaskService } from '../manage-task/task.service';
import { ToastrService } from 'ngx-toastr';

type DashboardFilter = 'all' | 'open' | 'in-progress' | 'report-sent' | 'completed' | 'overdue' | 'high-priority';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-dashboard.component.html',
  styleUrl: './employee-dashboard.component.scss'
})
export class EmployeeDashboardComponent implements OnInit, OnDestroy {
  currentUser = { id: '', name: 'Employee', email: '' };
  allTasks: Task[] = [];
  visibleTasks: Task[] = [];
  selectedTask: Task | null = null;
  isTaskDetailOpen = false;
  activeFilter: DashboardFilter = 'all';
  loading = false;
  actionLoading = new Set<string>();
  isUploadingProof = false;
  proofNote = '';
  proofFile: File | null = null;
  showFullDescription = false;
  previewAttachment: TaskAttachment | null = null;
  previewObjectUrl: string | null = null;
  previewSafeResourceUrl: SafeResourceUrl | null = null;
  previewMimeType = '';
  isPreviewLoading = false;
  previewError = '';
  readonly attachmentAccept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private taskService: TaskService,
    private authService: AuthService,
    private router: Router,
    private toastr: ToastrService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadTasks();
    this.refreshTimer = setInterval(() => {
      this.loadTasks(false);
    }, 60000);
  }

  ngOnDestroy(): void {
    this.resetPreviewState();
    this.syncBodyScrollLock(false);
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isTaskDetailOpen) {
      this.closeTaskDetails();
    }
  }

  get openTasksCount(): number {
    return this.allTasks.filter((task) => task.status === 'Pending').length;
  }

  get inProgressCount(): number {
    return this.allTasks.filter((task) => task.status === 'In Progress' || task.status === 'Report Sent').length;
  }

  get reportSentCount(): number {
    return this.allTasks.filter(
      (task) => task.status !== 'Completed' && (task.status === 'Report Sent' || !!task.reportSent),
    ).length;
  }

  get completedCount(): number {
    return this.allTasks.filter((task) => task.status === 'Completed').length;
  }

  get overdueCount(): number {
    return this.allTasks.filter((task) => this.isOverdue(task)).length;
  }

  setFilter(filter: DashboardFilter): void {
    this.activeFilter = filter;
    this.applyFilter();
  }

  clearFilter(): void {
    this.setFilter('all');
  }

  refreshTasks(): void {
    this.loadTasks(true);
  }

  goToReminders(): void {
    this.router.navigate(['/task-reminder']);
  }

  startTask(task: Task): void {
    if (task.status !== 'Pending') return;
    this.updateTaskStatus(task, 'In Progress');
  }

  markComplete(task: Task): void {
    if (task.status === 'Completed') return;
    if (!task.reportSent && task.status !== 'Report Sent') return;
    this.updateTaskStatus(task, 'Completed');
  }

  markReportSent(task: Task): void {
    if (task.status === 'Report Sent' || task.reportSent) return;
    this.updateTaskStatus(task, 'Report Sent', true);
  }

  openTaskDetails(task: Task): void {
    this.selectedTask = task;
    this.isTaskDetailOpen = true;
    this.proofFile = null;
    this.proofNote = '';
    this.showFullDescription = false;
    this.previewAttachment = null;
    this.syncBodyScrollLock(true);
  }

  closeTaskDetails(): void {
    this.isTaskDetailOpen = false;
    this.selectedTask = null;
    this.proofFile = null;
    this.proofNote = '';
    this.showFullDescription = false;
    this.previewAttachment = null;
    this.resetPreviewState();
    this.syncBodyScrollLock(false);
  }

  onProofFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.proofFile = input.files?.[0] || null;
  }

  toggleDescription(): void {
    this.showFullDescription = !this.showFullDescription;
  }

  shouldShowDescriptionToggle(description?: string): boolean {
    return (description || '').trim().length > 140;
  }

  getAttachmentIconClass(item: TaskAttachment): string {
    const mimeType = String(item.mimeType || '').toLowerCase();
    const fileName = String(item.fileName || '').toLowerCase();

    if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/.test(fileName)) {
      return 'fa-regular fa-file-image';
    }

    if (mimeType.includes('pdf') || fileName.endsWith('.pdf')) {
      return 'fa-regular fa-file-pdf';
    }

    if (mimeType.includes('word') || /\.(doc|docx)$/.test(fileName)) {
      return 'fa-regular fa-file-word';
    }

    if (mimeType.includes('excel') || mimeType.includes('sheet') || /\.(xls|xlsx)$/.test(fileName)) {
      return 'fa-regular fa-file-excel';
    }

    if (mimeType.includes('text') || fileName.endsWith('.txt')) {
      return 'fa-regular fa-file-lines';
    }

    return 'fa-regular fa-file';
  }

  canPreviewAttachment(item: TaskAttachment | null): boolean {
    if (!item?.url) {
      return false;
    }

    const mimeType = String(this.previewMimeType || item.mimeType || '').toLowerCase();
    const fileName = String(item.fileName || '').toLowerCase();

    return mimeType.startsWith('image/')
      || mimeType.includes('pdf')
      || mimeType.includes('text')
      || /\.(jpg|jpeg|png|gif|webp|pdf|txt)$/.test(fileName);
  }

  isImageAttachment(item: TaskAttachment | null): boolean {
    if (!item) {
      return false;
    }

    const mimeType = String(this.previewMimeType || item.mimeType || '').toLowerCase();
    const fileName = String(item.fileName || '').toLowerCase();
    return mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/.test(fileName);
  }

  async openAttachment(item: TaskAttachment): Promise<void> {
    if (!item?.url) {
      return;
    }

    this.previewAttachment = item;
    this.previewError = '';
    this.isPreviewLoading = true;
    this.revokePreviewObjectUrl();

    try {
      const response = await fetch(item.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error('Failed to load attachment preview.');
      }

      const contentType = String(response.headers.get('content-type') || item.mimeType || '');
      const blob = await response.blob();
      this.previewMimeType = contentType || blob.type || '';
      this.previewObjectUrl = URL.createObjectURL(blob);
      this.previewSafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl);

      if (!this.canPreviewAttachment(item)) {
        this.previewError = 'Preview is not available for this file type. Use Download to save it.';
      }
    } catch {
      this.previewError = 'Unable to load preview. You can still download the file.';
      this.previewObjectUrl = null;
      this.previewSafeResourceUrl = null;
      this.previewMimeType = '';
    } finally {
      this.isPreviewLoading = false;
    }
  }

  async downloadAttachment(item: TaskAttachment): Promise<void> {
    if (!item.url) {
      return;
    }

    try {
      const response = await fetch(item.url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.fileName || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      this.toastr.error('Failed to download attachment.', 'Error');
    }
  }

  getSelectedProofName(): string {
    return this.proofFile?.name || 'No file chosen';
  }

  uploadProof(task: Task): void {
    if (!task?._id) {
      return;
    }

    if (!this.proofFile) {
      this.toastr.error('Please select a proof file first.', 'Validation');
      return;
    }

    this.isUploadingProof = true;
    this.taskService.uploadTaskFile(this.proofFile).subscribe({
      next: (uploadResponse) => {
        const data = uploadResponse.data;
        if (!uploadResponse.success || !data?.url || !data?.filename) {
          this.isUploadingProof = false;
          this.toastr.error(uploadResponse.message || 'Failed to upload file.', 'Error');
          return;
        }

        this.taskService.addTaskAttachment(task._id!, {
          url: data.url,
          fileName: data.filename,
          mimeType: data.mimeType,
          note: this.proofNote.trim(),
        }).subscribe({
          next: (response) => {
            this.isUploadingProof = false;
            if (response.success && response.data && !Array.isArray(response.data)) {
              const updated = response.data as Task;
              this.selectedTask = updated;
              this.allTasks = this.allTasks.map((item) => (item._id === updated._id ? updated : item));
              this.applyFilter();
              this.proofFile = null;
              this.proofNote = '';
              this.toastr.success('Proof attachment added to task.', 'Success');
            } else {
              this.toastr.error(response.message || 'Failed to attach proof.', 'Error');
            }
          },
          error: () => {
            this.isUploadingProof = false;
            this.toastr.error('Failed to attach proof.', 'Error');
          },
        });
      },
      error: () => {
        this.isUploadingProof = false;
        this.toastr.error('Failed to upload proof file.', 'Error');
      },
    });
  }

  isTaskBusy(task: Task | null): boolean {
    if (!task) {
      return false;
    }
    return this.actionLoading.has(task._id || task.title);
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'Completed') return false;
    const due = new Date(task.dueDate).getTime();
    if (Number.isNaN(due)) return false;
    return due < Date.now();
  }

  formatDate(dateString: string): string {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  }

  statusClass(status: Task['status']): string {
    return status.replace(/\s+/g, '-').toLowerCase();
  }

  private loadCurrentUser(): void {
    const user = this.authService.getUser();
    this.currentUser = {
      id: user?._id || user?.id || '',
      name: user?.name || 'Employee',
      email: (user?.email || '').toLowerCase()
    };
  }

  private loadTasks(showLoader = true): void {
    if (showLoader) {
      this.loading = true;
    }
    this.taskService.getTasks().subscribe({
      next: (response) => {
        this.loading = false;
        if (!response.success || !Array.isArray(response.data)) {
          this.allTasks = [];
          this.applyFilter();
          return;
        }

        this.allTasks = response.data
          .filter((task) => this.isAssignedToCurrentUser(task))
          .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

        if (this.selectedTask?._id) {
          const refreshedTask = this.allTasks.find((task) => task._id === this.selectedTask?._id) || null;
          this.selectedTask = refreshedTask;
          if (!refreshedTask) {
            this.isTaskDetailOpen = false;
            this.syncBodyScrollLock(false);
          }
        }

        this.applyFilter();
      },
      error: () => {
        this.loading = false;
        this.allTasks = [];
        this.applyFilter();
      }
    });
  }

  private applyFilter(): void {
    this.visibleTasks = this.allTasks.filter((task) => {
      if (this.activeFilter === 'completed') return task.status === 'Completed';
      // Completed tasks move to the admin Payment/Report stages, so they are only shown via the Completed card.
      if (task.status === 'Completed') return false;
      if (this.activeFilter === 'all') return true;
      if (this.activeFilter === 'open') return task.status === 'Pending';
      if (this.activeFilter === 'in-progress') return task.status === 'In Progress';
      if (this.activeFilter === 'report-sent') return task.status === 'Report Sent' || !!task.reportSent;
      if (this.activeFilter === 'overdue') return this.isOverdue(task);
      if (this.activeFilter === 'high-priority') return task.priority === 'High';
      return true;
    });
  }

  private updateTaskStatus(task: Task, status: Task['status'], reportSent?: boolean): void {
    const taskId = task._id;
    const loadingKey = taskId || task.title;
    this.actionLoading.add(loadingKey);

    const previousStatus = task.status;
    const previousReportSent = !!task.reportSent;
    task.status = status;
    if (reportSent !== undefined) {
      task.reportSent = reportSent;
    } else if (status === 'Report Sent') {
      task.reportSent = true;
    }
    this.applyFilter();

    if (!taskId) {
      this.actionLoading.delete(loadingKey);
      return;
    }

    const assignedToId =
      typeof task.assignedTo === 'string'
        ? task.assignedTo
        : task.assignedTo?._id || this.currentUser.id;

    const payload: Task = {
      ...task,
      assignedTo: assignedToId,
      status,
      reportSent: status === 'Report Sent' ? true : !!task.reportSent,
    };

    this.taskService.updateTask(taskId, payload).subscribe({
      next: () => {
        this.actionLoading.delete(loadingKey);
        this.loadTasks(false);
      },
      error: () => {
        task.status = previousStatus;
        task.reportSent = previousReportSent;
        this.applyFilter();
        this.actionLoading.delete(loadingKey);
      }
    });
  }

  private isAssignedToCurrentUser(task: Task): boolean {
    if (!this.currentUser.id && !this.currentUser.email) return false;

    if (typeof task.assignedTo === 'string') {
      return task.assignedTo === this.currentUser.id;
    }

    const assignedId = task.assignedTo?._id || '';
    const assignedEmail = (task.assignedTo?.email || '').toLowerCase();

    return assignedId === this.currentUser.id || (!!assignedEmail && assignedEmail === this.currentUser.email);
  }

  private resetPreviewState(): void {
    this.isPreviewLoading = false;
    this.previewError = '';
    this.previewMimeType = '';
    this.previewSafeResourceUrl = null;
    this.revokePreviewObjectUrl();
  }

  private revokePreviewObjectUrl(): void {
    if (!this.previewObjectUrl) {
      return;
    }

    URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
  }

  private syncBodyScrollLock(locked: boolean): void {
    document.body.style.overflow = locked ? 'hidden' : '';
  }
}
