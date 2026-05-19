import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientService, Client } from '../manage-client/client.service';
import { TaskService, Task } from '../manage-task/task.service';
import { WorkHistoryItem, WorkHistoryService } from './work-history.service';
import { TimelineItemComponent } from './components/timeline-item/timeline-item.component';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

interface HistoryGroup {
  key: string;
  label: string;
  items: WorkHistoryItem[];
}

interface TaskMasterGroup {
  taskId: string;
  taskTitle: string;
  latestEvent: WorkHistoryItem;
  events: WorkHistoryItem[];
}

interface EventTypeGroup {
  label: string;
  count: number;
  latestAt: string;
  items: WorkHistoryItem[];
}

@Component({
  selector: 'app-work-history',
  standalone: true,
  imports: [CommonModule, FormsModule, TimelineItemComponent, FullscreenToggleComponent],
  templateUrl: './work-history.component.html',
  styleUrl: './work-history.component.scss',
})
export class WorkHistoryComponent implements OnInit {
  items: WorkHistoryItem[] = [];
  clients: Client[] = [];
  tasks: Task[] = [];

  selectedClientId = '';
  selectedTaskId = '';
  fromDate = '';
  toDate = '';
  isLoading = false;
  expandedId: string | null = null;
  taskDetailsExpanded = false;
  expandedTaskGroupId: string | null = null;

  constructor(
    private readonly historyService: WorkHistoryService,
    private readonly clientService: ClientService,
    private readonly taskService: TaskService,
  ) {}

  ngOnInit(): void {
    this.loadFilters();
    this.loadHistory();
  }

  get groupedTimeline(): HistoryGroup[] {
    const groups = new Map<string, WorkHistoryItem[]>();
    this.items.forEach((item) => {
      const key = this.dayKey(item.createdAt);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(item);
    });

    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, groupItems]) => ({
        key,
        label: this.groupLabel(key),
        items: groupItems,
      }));
  }

  get isTaskFocusedView(): boolean {
    return Boolean(this.selectedTaskId);
  }

  get isAllTasksMasterView(): boolean {
    return !this.selectedTaskId;
  }

  get taskMasterGroups(): TaskMasterGroup[] {
    if (!this.isAllTasksMasterView) {
      return [];
    }

    const groups = new Map<string, WorkHistoryItem[]>();

    this.items.forEach((item) => {
      const taskId = this.getTaskId(item);
      if (!taskId) {
        return;
      }

      if (!groups.has(taskId)) {
        groups.set(taskId, []);
      }

      groups.get(taskId)?.push(item);
    });

    const sortedGroups: TaskMasterGroup[] = [];

    groups.forEach((events, taskId) => {
      const sortedEvents = [...events].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const latestEvent = sortedEvents[0];
      if (!latestEvent) {
        return;
      }

      sortedGroups.push({
        taskId,
        taskTitle: this.getTaskTitle(taskId, latestEvent),
        latestEvent,
        events: sortedEvents,
      });
    });

    return sortedGroups.sort(
      (a, b) =>
        new Date(b.latestEvent.createdAt).getTime() - new Date(a.latestEvent.createdAt).getTime(),
    );
  }

  get selectedTaskEvents(): WorkHistoryItem[] {
    const selectedId = this.selectedTaskId;
    if (!selectedId) {
      return [];
    }

    return [...this.items]
      .filter((item) => this.getTaskId(item) === selectedId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  get mainTaskEvent(): WorkHistoryItem | null {
    return this.selectedTaskEvents[0] || null;
  }

  get selectedTaskTitle(): string {
    const taskFromFilter = this.tasks.find((task) => task._id === this.selectedTaskId);
    if (taskFromFilter?.title) {
      return taskFromFilter.title;
    }

    const mainEvent = this.mainTaskEvent;
    if (mainEvent?.taskId && typeof mainEvent.taskId === 'object' && mainEvent.taskId.title) {
      return mainEvent.taskId.title;
    }

    return 'Selected Task';
  }

  loadFilters(): void {
    this.clientService.getClients({ page: 1, limit: 200, sort: 'desc' }).subscribe({
      next: (res) => {
        if (res.success) {
          this.clients = res.data;
        }
      },
    });

    this.taskService.getTasks().subscribe({
      next: (res) => {
        if (res.success && Array.isArray(res.data)) {
          this.tasks = res.data;
        }
      },
    });
  }

  loadHistory(): void {
    this.isLoading = true;
    this.taskDetailsExpanded = false;
    this.expandedTaskGroupId = null;
    this.historyService.getHistory({
      clientId: this.selectedClientId || undefined,
      taskId: this.selectedTaskId || undefined,
      fromDate: this.fromDate ? new Date(this.fromDate).toISOString() : undefined,
      toDate: this.toDate ? new Date(this.toDate).toISOString() : undefined,
      limit: 300,
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.items = res.success ? res.data : [];
      },
      error: () => {
        this.isLoading = false;
        this.items = [];
      },
    });
  }

  resetFilters(): void {
    this.selectedClientId = '';
    this.selectedTaskId = '';
    this.fromDate = '';
    this.toDate = '';
    this.taskDetailsExpanded = false;
    this.expandedTaskGroupId = null;
    this.loadHistory();
  }

  toggleExpanded(itemId: string): void {
    this.expandedId = this.expandedId === itemId ? null : itemId;
  }

  toggleTaskDetails(): void {
    this.taskDetailsExpanded = !this.taskDetailsExpanded;
  }

  toggleTaskGroup(taskId: string): void {
    this.expandedTaskGroupId = this.expandedTaskGroupId === taskId ? null : taskId;
  }

  getEventGroups(events: WorkHistoryItem[]): EventTypeGroup[] {
    const grouped = new Map<string, WorkHistoryItem[]>();

    events.forEach((event) => {
      const label = this.getTypeLabel(event);
      if (!grouped.has(label)) {
        grouped.set(label, []);
      }
      grouped.get(label)?.push(event);
    });

    const groups: EventTypeGroup[] = [];

    grouped.forEach((groupItems, label) => {
      const sortedItems = [...groupItems].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      groups.push({
        label,
        count: sortedItems.length,
        latestAt: sortedItems[0]?.createdAt || '',
        items: sortedItems,
      });
    });

    return groups.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
  }


  getTaskId(item: WorkHistoryItem): string {
    if (!item.taskId) {
      return '';
    }

    if (typeof item.taskId === 'string') {
      return item.taskId;
    }

    return item.taskId._id || '';
  }

  getTypeLabel(item: WorkHistoryItem): string {
    switch (item.type) {
      case 'report':
        return 'Report Send';
      case 'assignment':
        return 'Task Assigned';
      case 'task':
        if (this.lower(item.title).includes('picked')) return 'Task Picked';
        return 'Task Created';
      case 'payment':
        return 'Payment Received';
      default:
        return 'Activity';
    }
  }

  getEventTitle(item: WorkHistoryItem): string {
    const time = this.formatShortTime(item.createdAt);
    const typeLabel = this.getTypeLabel(item);

    if (typeLabel === 'Report Send') {
      return `Report submitted at ${time}`;
    }

    if (typeLabel === 'Task Picked') {
      return `Task picked at ${time}`;
    }

    if (typeLabel === 'Task Assigned') {
      return `Task assigned at ${time}`;
    }

    if (typeLabel === 'Task Created') {
      return `Task created at ${time}`;
    }

    if (typeLabel === 'Payment Received') {
      return `Payment received at ${time}`;
    }

    return `Activity updated at ${time}`;
  }

  getEventIconByLabel(label: string): string {
    switch (label) {
      case 'Report Send':
        return 'fa-circle-check';
      case 'Task Created':
        return 'fa-circle-plus';
      case 'Task Assigned':
        return 'fa-user-plus';
      case 'Task Picked':
        return 'fa-circle-play';
      case 'Payment Received':
        return 'fa-money-bill-wave';
      default:
        return 'fa-circle-info';
    }
  }

  getEventToneClassByLabel(label: string): string {
    switch (label) {
      case 'Report Send':
        return 'tone-report';
      case 'Task Created':
      case 'Task Picked':
        return 'tone-task';
      case 'Task Assigned':
        return 'tone-assignment';
      case 'Payment Received':
        return 'tone-message';
      default:
        return 'tone-message';
    }
  }

  getEventToneClass(item: WorkHistoryItem): string {
    return this.getEventToneClassByLabel(this.getTypeLabel(item));
  }

  getTaskTitle(taskId: string, fallbackItem?: WorkHistoryItem): string {
    const task = this.tasks.find((entry) => entry._id === taskId);
    if (task?.title) {
      return task.title;
    }

    if (fallbackItem?.taskId && typeof fallbackItem.taskId === 'object' && fallbackItem.taskId.title) {
      return fallbackItem.taskId.title;
    }

    return 'Task';
  }

  getColorClass(item: WorkHistoryItem): string {
    if (item.type === 'message') return 'info';
    if (item.type === 'payment') return 'payment';
    if (item.type === 'report') return 'report';
    if (item.type === 'assignment') return 'assignment';
    if (item.type === 'task') {
      if (this.lower(item.title).includes('picked')) return 'picked';
      return 'task';
    }
    return 'info';
  }

  getIconClass(type: string): string {
    switch (type) {
      case 'message':
        return 'fa-comments';
      case 'task':
        return 'fa-list-check';
      case 'assignment':
        return 'fa-user-check';
      case 'report':
        return 'fa-file-circle-check';
      case 'payment':
        return 'fa-money-bill-wave';
      default:
        return 'fa-circle';
    }
  }

  getDisplayTitle(item: WorkHistoryItem): string {
    const employee = this.getEmployeeLabel(item);
    const baseTitle = String(item.title || '').trim();

    if (item.type === 'report') {
      return employee === 'System' ? 'Report submitted' : `Report submitted by ${employee}`;
    }

    if (item.type === 'assignment') {
      return employee === 'System' ? 'Task assigned' : `Task assigned to ${employee}`;
    }

    if (item.type === 'task' && this.lower(baseTitle).includes('picked')) {
      return employee === 'System' ? 'Task picked' : `Task picked by ${employee}`;
    }

    if (item.type === 'message') {
      return 'Message received';
    }

    if (item.type === 'payment') {
      return 'Payment updated';
    }

    return baseTitle || 'Activity updated';
  }

  getEmployeeLabel(item: WorkHistoryItem): string {
    if (item.employeeId && typeof item.employeeId === 'object') {
      return item.employeeId.fullName || item.employeeId.email || 'System';
    }

    return 'System';
  }

  asKeyValues(meta: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
    if (!meta) {
      return [];
    }

    return Object.entries(meta).map(([key, value]) => ({ key, value: String(value) }));
  }

  formatRelativeTime(dateValue: string): string {
    const date = new Date(dateValue);
    const diffMs = Date.now() - date.getTime();
    if (Number.isNaN(diffMs)) {
      return '-';
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return 'Just now';
    if (diffMs < hour) {
      const mins = Math.max(1, Math.floor(diffMs / minute));
      return `${mins} min${mins > 1 ? 's' : ''} ago`;
    }
    if (diffMs < day) {
      const hrs = Math.max(1, Math.floor(diffMs / hour));
      return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    }

    const days = Math.max(1, Math.floor(diffMs / day));
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  formatExactTime(dateValue: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  formatShortTime(dateValue: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  isLatest(item: WorkHistoryItem): boolean {
    return Boolean(this.items[0]?._id && this.items[0]._id === item._id);
  }

  private dayKey(dateValue: string): string {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      return '0000-00-00';
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private groupLabel(dayKey: string): string {
    const today = this.dayKey(new Date().toISOString());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = this.dayKey(yesterdayDate.toISOString());

    if (dayKey === today) return 'Today';
    if (dayKey === yesterday) return 'Yesterday';

    const date = new Date(dayKey);
    if (Number.isNaN(date.getTime())) {
      return 'Older';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }

  private lower(value: string): string {
    return String(value || '').toLowerCase();
  }

}
