import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { TaskService, Task } from '../task.service';
import { isValidMongoObjectId } from '../../manage-chat/manage-chat/chat.service';
import { EmployeeService, Employee } from '../../manage-employee/employee.service';
import { AuthService } from '../../auth/auth.service';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';
import { FullscreenToggleComponent } from '../../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';

@Component({
  selector: 'app-manage-task',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DateTimePickerComponent, FullscreenToggleComponent],
  templateUrl: './manage-task.component.html',
  styleUrls: ['./manage-task.component.scss']
})
export class ManageTaskComponent {
  isTaskModalOpen = false;
  isDeleteModalOpen = false;
  isEditMode = false;
  isViewOnlyMode = false;
  pageSize = 25;
  currentPage = 1;
  readonly pageSizeOptions = [25, 50, 100];
  currentUser: any = null;
  isAdmin = false;
  isEmployee = false;
  selectedTaskId: string | null = null;

  tasks: Task[] = [];
  filteredTasks: Task[] = [];
  employees: Employee[] = [];
  loading = false;
  activeKpi: 'all' | 'pending' | 'in-progress' | 'completed' | 'overdue' = 'all';
  loadingSave = false;
  message = '';
  messageType: 'success' | 'error' = 'success';
  selectedFiles: File[] = [];

  readonly maxFileSizeBytes = 15 * 1024 * 1024;
  readonly acceptedFileExtensions = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt';
  readonly allowedFileTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'text/plain'
  ]);

  readonly reminderOptions = [
    { label: '10 Minutes Before', value: 10 },
    { label: '30 Minutes Before', value: 30 },
    { label: '1 Hour Before', value: 60 },
    { label: '1 Day Before', value: 1440 }
  ];

  readonly filterForm: FormGroup;
  readonly taskForm: FormGroup;

  editingTaskId: string | null = null;
  editingTaskDisplayId: string | null = null;
  editingTaskOriginalDueDate: string | null = null;
  openActionMenuTaskId: string | null = null;
  chatTaskOrigin: {
    createdFromChat?: boolean;
    conversationId?: string;
    chatMessageId?: string;
    chatPhone?: string;
    messageText?: string;
  } | null = null;

  constructor(
    private taskService: TaskService,
    private employeeService: EmployeeService,
    private authService: AuthService,
    private toastr: ToastrService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.filterForm = this.fb.group({
      searchTerm: [''],
      statusFilter: ['All Status'],
      employeeFilter: ['All Employees'],
      fromDate: [''],
      toDate: ['']
    });

    this.taskForm = this.fb.group({
      title: [''],
      description: [''],
      assignedTo: [''],
      customerName: [''],
      customerPhone: [''],
      paymentReceived: [false],
      reportSent: [false],
      priority: ['Medium'],
      status: ['Pending'],
      dueDate: [new Date().toISOString()],
      reminderEnabled: [false],
      reminderBefore: [10]
    });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isTaskModalOpen) {
      this.closeTaskModal();
    }
    this.closeActionMenu();
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeActionMenu();
  }

  ngOnInit() {
    this.currentUser = this.authService.getUser();
    this.isAdmin = this.authService.isAdmin();
    this.isEmployee = this.authService.isEmployee();
    this.loadEmployees();
    this.loadTasks();

    this.filterForm.valueChanges.subscribe(() => {
      this.currentPage = 1;
      this.syncKpiFromFilters();
      this.applyFilters();
    });

    this.applyTaskPrefillFromNavigationState();

    this.route.queryParams.subscribe((params) => {
      if (params['customerName'] || params['customerPhone'] || params['taskTitle'] || params['taskDescription']) {
        this.openAddTask();
        this.taskForm.patchValue({
          title: params['taskTitle'] || '',
          description: params['taskDescription'] || '',
          customerName: params['customerName'] || '',
          customerPhone: params['customerPhone'] || ''
        });
      }

      const linkedTaskId = String(params['taskId'] || '').trim();
      if (linkedTaskId) {
        this.openTaskById(linkedTaskId);
      }
    });
  }

  get hasChatOrigin(): boolean {
    return Boolean(
      this.chatTaskOrigin?.createdFromChat
      && this.chatTaskOrigin?.chatMessageId
      && (this.chatTaskOrigin?.chatPhone || this.taskForm.get('customerPhone')?.value),
    );
  }

  private resolveDefaultAssigneeId(): string {
    if (!this.isAdmin || !this.employees.length) {
      return '';
    }

    const currentEmail = String(this.currentUser?.email || '').toLowerCase();
    const matchedSelf = this.employees.find((emp) => String(emp.email || '').toLowerCase() === currentEmail);
    if (matchedSelf?._id) {
      return matchedSelf._id;
    }

    return this.employees[0]?._id || '';
  }

  private applyTaskPrefillFromNavigationState(): void {
    const prefill = window.history.state?.taskPrefill;
    if (!prefill || typeof prefill !== 'object') {
      return;
    }

    this.openAddTask();
    this.chatTaskOrigin = {
      createdFromChat: Boolean(prefill.createdFromChat),
      conversationId: isValidMongoObjectId(prefill.conversationId)
        ? String(prefill.conversationId).trim()
        : '',
      chatMessageId: prefill.chatMessageId || '',
      chatPhone: prefill.chatPhone || prefill.customerPhone || '',
      messageText: prefill.messageText || prefill.description || '',
    };
    this.taskForm.patchValue({
      title: prefill.title || '',
      description: prefill.description || '',
      customerName: prefill.customerName || '',
      customerPhone: prefill.customerPhone || '',
    });
  }

  private openTaskById(taskId: string): void {
    this.taskService.getTaskById(taskId).subscribe({
      next: (response) => {
        if (!response.success || Array.isArray(response.data) || !response.data) {
          return;
        }

        const task = response.data as Task;
        if (task.status === 'Completed') {
          this.openViewTask(task);
        } else {
          this.openEditTask(task);
        }
      },
      error: () => {
        this.showMessage('Unable to open linked task', 'error');
      },
    });
  }

  viewOriginalMessage(): void {
    const phone = String(this.chatTaskOrigin?.chatPhone || this.taskForm.get('customerPhone')?.value || '').trim();
    const messageId = String(this.chatTaskOrigin?.chatMessageId || '').trim();
    if (!phone || !messageId) {
      return;
    }

    this.router.navigate(['/communication/chats'], {
      queryParams: {
        phone,
        highlightMessage: messageId,
      },
    });
  }

  loadEmployees() {
    this.employeeService.getEmployees().subscribe({
      next: (res) => {
        if (res.success && Array.isArray(res.data)) {
          this.employees = res.data;

          if (this.isTaskModalOpen && this.isAdmin && !this.taskForm.get('assignedTo')?.value) {
            const defaultAssignee = this.resolveDefaultAssigneeId();
            if (defaultAssignee) {
              this.taskForm.patchValue({ assignedTo: defaultAssignee });
            }
          }
        }
      },
      error: () => {
        this.toastr.error('Failed to load employees', 'Error');
      }
    });
  }

  loadTasks() {
    this.loading = true;
    this.message = '';
    this.taskService.getTasks().subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success && Array.isArray(res.data)) {
          this.tasks = res.data;
          this.applyFilters();
        } else {
          this.showMessage('Unable to load tasks', 'error');
        }
      },
      error: () => {
        this.loading = false;
        this.showMessage('Unable to load tasks', 'error');
      }
    });
  }

  applyFilters() {
    const searchTerm = (this.filterForm.get('searchTerm')?.value || '').toLowerCase();
    const statusFilter = this.filterForm.get('statusFilter')?.value || 'All Status';
    const employeeFilter = this.filterForm.get('employeeFilter')?.value || 'All Employees';
    const fromDateStr = this.filterForm.get('fromDate')?.value;
    const toDateStr = this.filterForm.get('toDate')?.value;

    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (fromDateStr) {
      fromDate = new Date(fromDateStr);
      fromDate.setHours(0, 0, 0, 0);
    }

    if (toDateStr) {
      toDate = new Date(toDateStr);
      toDate.setHours(23, 59, 59, 999);
    }

    this.filteredTasks = this.tasks.filter((task) => {
      const matchesSearch = !searchTerm
        ? true
        : [task.title, task.description, task.customerName || '', task.customerPhone || '', task.displayId || '']
            .some((value) => String(value).toLowerCase().includes(searchTerm));

      const matchesStatus = statusFilter === 'All Status' || task.status === statusFilter;
      const matchesKpi = this.matchesKpiFilter(task);

      const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
      const matchesFromDate = !fromDate || (taskDueDate && !Number.isNaN(taskDueDate.getTime()) && taskDueDate >= fromDate);
      const matchesToDate = !toDate || (taskDueDate && !Number.isNaN(taskDueDate.getTime()) && taskDueDate <= toDate);

      const assignedId = typeof task.assignedTo === 'string' ? task.assignedTo : task.assignedTo?._id || '';
      const matchesEmployeeFilter = this.isAdmin
        ? employeeFilter === 'All Employees' || assignedId === employeeFilter
        : true;

      const matchesEmployee = this.isAdmin ? true : this.isTaskAssignedToUser(task);

      return matchesSearch && matchesStatus && matchesKpi && matchesFromDate && matchesToDate && matchesEmployeeFilter && matchesEmployee;
    });
  }

  get taskStats() {
    const visible = this.isAdmin
      ? this.tasks
      : this.tasks.filter((task) => this.isTaskAssignedToUser(task));

    return {
      total: visible.length,
      pending: visible.filter((task) => task.status === 'Pending').length,
      inProgress: visible.filter((task) => task.status === 'In Progress').length,
      completed: visible.filter((task) => task.status === 'Completed').length,
      overdue: visible.filter((task) => this.isTaskOverdue(task)).length,
    };
  }

  applyKpiFilter(kpi: 'all' | 'pending' | 'in-progress' | 'completed' | 'overdue'): void {
    this.activeKpi = kpi;
    this.currentPage = 1;

    if (kpi === 'all') {
      this.filterForm.patchValue({ statusFilter: 'All Status' }, { emitEvent: false });
    } else if (kpi === 'pending') {
      this.filterForm.patchValue({ statusFilter: 'Pending' }, { emitEvent: false });
    } else if (kpi === 'in-progress') {
      this.filterForm.patchValue({ statusFilter: 'In Progress' }, { emitEvent: false });
    } else if (kpi === 'completed') {
      this.filterForm.patchValue({ statusFilter: 'Completed' }, { emitEvent: false });
    } else if (kpi === 'overdue') {
      this.filterForm.patchValue({ statusFilter: 'All Status' }, { emitEvent: false });
    }

    this.applyFilters();
  }

  private syncKpiFromFilters(): void {
    const statusFilter = this.filterForm.get('statusFilter')?.value || 'All Status';
    if (this.activeKpi === 'overdue') {
      return;
    }
    if (statusFilter === 'All Status') {
      this.activeKpi = 'all';
    } else if (statusFilter === 'Pending') {
      this.activeKpi = 'pending';
    } else if (statusFilter === 'In Progress') {
      this.activeKpi = 'in-progress';
    } else if (statusFilter === 'Completed') {
      this.activeKpi = 'completed';
    } else {
      this.activeKpi = 'all';
    }
  }

  private matchesKpiFilter(task: Task): boolean {
    if (this.activeKpi === 'all') {
      return true;
    }
    if (this.activeKpi === 'overdue') {
      return this.isTaskOverdue(task);
    }
    if (this.activeKpi === 'pending') {
      return task.status === 'Pending';
    }
    if (this.activeKpi === 'in-progress') {
      return task.status === 'In Progress';
    }
    if (this.activeKpi === 'completed') {
      return task.status === 'Completed';
    }
    return true;
  }

  isTaskOverdue(task: Task): boolean {
    if (task.status === 'Completed') {
      return false;
    }
    if (!task.dueDate) {
      return false;
    }
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) {
      return false;
    }
    return due.getTime() < Date.now();
  }

  private isTaskAssignedToUser(task: Task): boolean {
    if (!this.currentUser) return false;
    const assignedTo = task.assignedTo;
    const userId = this.currentUser._id || this.currentUser.id;
    const userEmail = (this.currentUser.email || '').toLowerCase();

    if (typeof assignedTo === 'string') {
      return assignedTo === userId;
    }

    const assignedId = assignedTo?._id || '';
    const assignedEmail = (assignedTo?.email || '').toLowerCase();
    return assignedId === userId || (!!userEmail && assignedEmail === userEmail);
  }

  openAddTask() {
    const defaultAssignee = this.resolveDefaultAssigneeId();

    this.isEditMode = false;
    this.editingTaskId = null;
    this.editingTaskDisplayId = null;
    this.chatTaskOrigin = null;
    this.taskForm.reset({
      title: '',
      description: '',
      assignedTo: defaultAssignee,
      customerName: '',
      customerPhone: '',
      paymentReceived: false,
      reportSent: false,
      priority: 'Medium',
      status: 'Pending',
      dueDate: new Date().toISOString(),
      reminderEnabled: false,
      reminderBefore: 10
    });
    this.selectedFiles = [];
    this.isTaskModalOpen = true;
  }

  isTaskCompleted(task: Task): boolean {
    return String(task.status || '').trim() === 'Completed';
  }

  openViewTask(task: Task): void {
    this.openEditTask(task, true);
  }

  openEditTask(task: Task, viewOnly = false) {
    const readOnly = viewOnly || this.isTaskCompleted(task);
    this.isViewOnlyMode = readOnly;
    this.isEditMode = true;
    this.editingTaskId = task._id || null;
    this.editingTaskDisplayId = String(task.displayId || '').trim() || null;
    this.editingTaskOriginalDueDate = task.dueDate
      ? (this.normalizeDueDateForApi(task.dueDate) || null)
      : null;
    this.chatTaskOrigin = task.createdFromChat && task.chatMessageId
      ? {
        createdFromChat: true,
        conversationId: task.conversationId || '',
        chatMessageId: task.chatMessageId || '',
        chatPhone: task.chatPhone || task.customerPhone || '',
        messageText: task.messageText || task.description || '',
      }
      : null;
    this.selectedFiles = [];
    this.isTaskModalOpen = true;

    const formValues = {
      title: task.title,
      description: task.description,
      assignedTo: typeof task.assignedTo === 'string' ? task.assignedTo : task.assignedTo?._id || task.assignedTo?.fullName || task.assignedTo?.name || '',
      customerName: task.customerName || '',
      customerPhone: task.customerPhone || '',
      paymentReceived: !!task.paymentReceived,
      reportSent: !!task.reportSent,
      priority: task.priority,
      status: task.status,
      dueDate: this.normalizeDueDateForForm(task.dueDate),
      reminderEnabled: !!task.reminderEnabled,
      reminderBefore: Number(task.reminderBefore) || 10,
    };

    // Patch after drawer mounts so the datetime picker receives the stored due date.
    setTimeout(() => {
      this.taskForm.reset(formValues);
      if (readOnly) {
        this.taskForm.disable({ emitEvent: false });
      } else {
        this.taskForm.enable({ emitEvent: false });
      }
    });
  }

  closeTaskModal() {
    this.isTaskModalOpen = false;
    this.isViewOnlyMode = false;
    this.isEditMode = false;
    this.editingTaskId = null;
    this.editingTaskDisplayId = null;
    this.editingTaskOriginalDueDate = null;
    this.taskForm.enable({ emitEvent: false });
    this.selectedFiles = [];
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const droppedFiles = event.dataTransfer?.files;
    if (!droppedFiles?.length) {
      return;
    }

    this.handleSelectedFiles(Array.from(droppedFiles));
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) {
      return;
    }

    this.handleSelectedFiles(Array.from(files));
    input.value = '';
  }

  removeFile(index: number): void {
    this.selectedFiles = this.selectedFiles.filter((_, idx) => idx !== index);
  }

  getFileSize(bytes: number): string {
    if (!bytes) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private handleSelectedFiles(files: File[]): void {
    for (const file of files) {
      if (!this.allowedFileTypes.has(String(file.type || '').toLowerCase())) {
        this.showMessage(`Unsupported file type for ${file.name}`, 'error');
        continue;
      }

      if (file.size > this.maxFileSizeBytes) {
        this.showMessage(`File exceeds 15MB limit: ${file.name}`, 'error');
        continue;
      }

      const alreadyAdded = this.selectedFiles.some(
        (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified
      );

      if (!alreadyAdded) {
        this.selectedFiles.push(file);
      }
    }
  }

  private uploadAndAttachFiles(taskId: string): Observable<void> {
    if (!this.selectedFiles.length) {
      return of(void 0);
    }

    const requests = this.selectedFiles.map((file) =>
      this.taskService.uploadTaskFile(file).pipe(
        switchMap((uploadResponse) => {
          const uploaded = uploadResponse.data;
          if (!uploadResponse.success || !uploaded?.url || !uploaded.filename) {
            return throwError(() => new Error(uploadResponse.message || `Failed to upload ${file.name}`));
          }

          return this.taskService.addTaskAttachment(taskId, {
            url: uploaded.url,
            fileName: uploaded.filename,
            mimeType: uploaded.mimeType,
          });
        }),
        map((attachResponse) => {
          if (!attachResponse.success) {
            throw new Error(attachResponse.message || `Failed to attach ${file.name}`);
          }
          return true;
        })
      )
    );

    return forkJoin(requests).pipe(map(() => void 0));
  }

  saveTask() {
    const formValue = this.taskForm.getRawValue();

    if (!formValue.title?.trim()) {
      this.showMessage('Task title is required', 'error');
      return;
    }

    if (!String(formValue.assignedTo || '').trim()) {
      this.showMessage('Please select an employee for this task', 'error');
      return;
    }

    const nextReportSent = formValue.status === 'Report Sent' ? true : !!formValue.reportSent;
    if (formValue.status === 'Completed' && !nextReportSent) {
      this.showMessage('Mark report as sent before completing the task', 'error');
      return;
    }

    const normalizedDueDate = this.normalizeDueDateForApi(formValue.dueDate);
    if (!normalizedDueDate && !this.isEditMode) {
      this.showMessage('Due date and time is required', 'error');
      return;
    }

    const dueDateForSave = this.isEditMode
      ? (normalizedDueDate || this.editingTaskOriginalDueDate || undefined)
      : (normalizedDueDate || new Date().toISOString());

    this.loadingSave = true;
    const payload: Task = {
      title: formValue.title,
      description: formValue.description,
      assignedTo: formValue.assignedTo,
      customerName: formValue.customerName || '',
      customerPhone: formValue.customerPhone || '',
      paymentReceived: !!formValue.paymentReceived,
      reportSent: nextReportSent,
      priority: formValue.priority,
      status: formValue.status,
      dueDate: dueDateForSave || '',
      reminderEnabled: formValue.reminderEnabled,
      reminderBefore: formValue.reminderBefore,
      ...(this.chatTaskOrigin?.createdFromChat && !this.isEditMode
        ? {
          createdFromChat: true,
          ...(isValidMongoObjectId(this.chatTaskOrigin.conversationId)
            ? { conversationId: String(this.chatTaskOrigin.conversationId).trim() }
            : {}),
          chatMessageId: this.chatTaskOrigin.chatMessageId,
          chatPhone: this.chatTaskOrigin.chatPhone || formValue.customerPhone || '',
          messageText: this.chatTaskOrigin.messageText || formValue.description || '',
        }
        : {}),
    };

    const saveRequest$ = this.isEditMode && this.editingTaskId
      ? this.taskService.updateTask(this.editingTaskId, payload)
      : this.taskService.createTask(payload);

    saveRequest$
      .pipe(
        switchMap((saveResponse) => {
          if (!saveResponse.success) {
            return throwError(() => new Error(saveResponse.message || 'Failed to save task'));
          }

          const taskData = saveResponse.data && !Array.isArray(saveResponse.data)
            ? (saveResponse.data as Task)
            : null;
          const taskId = this.isEditMode ? this.editingTaskId : (taskData?._id || null);

          if (!taskId || !this.selectedFiles.length) {
            return of({ saveResponse, attachmentError: '' });
          }

          return this.uploadAndAttachFiles(taskId).pipe(
            map(() => ({ saveResponse, attachmentError: '' })),
            catchError((error) => of({
              saveResponse,
              attachmentError: error instanceof Error ? error.message : 'Task saved, but file upload failed.',
            }))
          );
        })
      )
      .subscribe({
        next: ({ saveResponse, attachmentError }) => {
          this.loadingSave = false;

          if (this.isEditMode && this.editingTaskId) {
            const updatedTask = saveResponse.data && !Array.isArray(saveResponse.data)
              ? (saveResponse.data as Task)
              : null;
            this.tasks = this.tasks.map((item) => {
              if (item._id !== this.editingTaskId) {
                return item;
              }
              const mergedDueDate = normalizedDueDate || updatedTask?.dueDate || item.dueDate;
              return {
                ...item,
                ...(updatedTask || {}),
                dueDate: mergedDueDate,
                paymentReceived: !!formValue.paymentReceived,
                reportSent: nextReportSent,
              };
            });
            this.applyFilters();
          } else {
            this.loadTasks();
          }

          this.showMessage(
            attachmentError || (this.isEditMode ? 'Task updated successfully' : 'Task created successfully'),
            attachmentError ? 'error' : 'success'
          );
          this.closeTaskModal();
        },
        error: () => {
          this.loadingSave = false;
          this.showMessage(this.isEditMode ? 'Failed to update task' : 'Failed to create task', 'error');
        }
      });
  }

  openDeleteModal(task: Task) {
    this.selectedTaskId = task._id || null;
    this.isDeleteModalOpen = true;
  }

  closeDeleteModal() {
    this.isDeleteModalOpen = false;
    this.selectedTaskId = null;
  }

  confirmDelete() {
    if (!this.selectedTaskId) {
      return;
    }
    this.taskService.deleteTask(this.selectedTaskId).subscribe({
      next: (res) => {
        if (res.success) {
          this.showMessage('Task deleted successfully', 'success');
          this.closeDeleteModal();
          this.loadTasks();
        } else {
          this.showMessage(res.message || 'Failed to delete task', 'error');
        }
      },
      error: () => {
        this.showMessage('Failed to delete task', 'error');
      }
    });
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

  getAssignedUserName(task: Task): string {
    return typeof task.assignedTo === 'string'
      ? task.assignedTo
      : task.assignedTo?.fullName || task.assignedTo?.name || task.assignedTo?.email || '';
  }

  trackByTaskId(_index: number, task: Task): string {
    return task._id || `${task.title}-${task.dueDate}`;
  }

  getTaskDisplayId(task: Task): string {
    return String(task.displayId || '').trim() || '—';
  }

  get paginatedTasks(): Task[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTasks.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTasks.length / this.pageSize));
  }

  get paginationStart(): number {
    if (!this.filteredTasks.length) {
      return 0;
    }
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredTasks.length);
  }

  onPageSizeChange(raw: string | number): void {
    this.pageSize = Number(raw) || 25;
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    this.currentPage = next;
  }

  formatTaskDueDate(value: unknown): string {
    if (!value) {
      return '—';
    }

    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  getPriorityDotClass(priority: string | undefined): string {
    const normalized = String(priority || '').toLowerCase();
    if (normalized === 'high') {
      return 'priority-dot priority-dot--high';
    }
    if (normalized === 'low') {
      return 'priority-dot priority-dot--low';
    }
    return 'priority-dot priority-dot--medium';
  }

  private normalizeDueDateForForm(value: unknown): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  private normalizeDueDateForApi(value: unknown): string | undefined {
    const raw = String(value || '').trim();
    if (!raw) {
      return undefined;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  getPriorityClass(priority: string | undefined): string {
    const normalized = String(priority || '').toLowerCase();
    if (normalized === 'high') {
      return 'high';
    }
    if (normalized === 'medium') {
      return 'medium';
    }
    if (normalized === 'low') {
      return 'low';
    }
    return 'medium';
  }

  getStatusClass(status: string | undefined): string {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'pending') {
      return 'pending';
    }
    if (normalized === 'in progress') {
      return 'inprogress';
    }
    if (normalized === 'report sent') {
      return 'reportsent';
    }
    if (normalized === 'completed') {
      return 'completed';
    }
    return '';
  }

  toggleActionMenu(task: Task, event: Event): void {
    event.stopPropagation();
    const taskId = task._id || '';
    this.openActionMenuTaskId = this.openActionMenuTaskId === taskId ? null : taskId;
  }

  isActionMenuOpen(task: Task): boolean {
    return Boolean(task._id) && this.openActionMenuTaskId === task._id;
  }

  closeActionMenu(): void {
    this.openActionMenuTaskId = null;
  }

  getCustomerLabel(task: Task): string {
    const name = task.customerName?.trim();
    const phone = task.customerPhone?.trim();

    if (name && phone) {
      return `${name} (${phone})`;
    }

    return name || phone || 'Manual task';
  }

  get reminderEnabled(): boolean {
    return !!this.taskForm.get('reminderEnabled')?.value;
  }

  get reportSentSelected(): boolean {
    return !!this.taskForm.get('reportSent')?.value || this.taskForm.get('status')?.value === 'Report Sent';
  }
}
