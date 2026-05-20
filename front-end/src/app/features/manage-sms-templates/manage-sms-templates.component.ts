import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { SmsTemplate, SmsTemplateService } from './sms-template.service';

@Component({
  selector: 'app-manage-sms-templates',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent],
  templateUrl: './manage-sms-templates.component.html',
  styleUrl: './manage-sms-templates.component.scss',
})
export class ManageSmsTemplatesComponent implements OnInit {
  templates: SmsTemplate[] = [];
  filteredTemplates: SmsTemplate[] = [];
  searchTerm = '';
  isLoading = false;
  isImporting = false;
  selectedTemplate: SmsTemplate | null = null;

  constructor(
    private readonly smsTemplateService: SmsTemplateService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  onSearchChange(): void {
    this.applyFilter();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isImporting = true;
    this.smsTemplateService
      .importTemplates(file)
      .pipe(finalize(() => {
        this.isImporting = false;
        input.value = '';
      }))
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toastr.error(response.message || 'Import failed', 'SMS Templates');
            return;
          }

          const summary = response.data;
          this.toastr.success(
            `Imported: ${summary.created} new, ${summary.updated} updated, ${summary.skipped} skipped`,
            'SMS Templates',
          );
          this.loadTemplates();
        },
        error: (error) => {
          this.toastr.error(error?.error?.message || 'Failed to import SMS templates', 'SMS Templates');
        },
      });
  }

  openPreview(template: SmsTemplate): void {
    this.selectedTemplate = template;
  }

  closePreview(): void {
    this.selectedTemplate = null;
  }

  toggleActive(template: SmsTemplate): void {
    const nextActive = !template.isActive;
    this.smsTemplateService.setTemplateActive(template._id, nextActive).subscribe({
      next: (response) => {
        if (!response.success) {
          return;
        }
        template.isActive = response.data.isActive;
        this.applyFilter();
        this.toastr.success(
          `Template ${template.templateName || template.templateId} marked ${nextActive ? 'active' : 'inactive'}`,
        );
      },
      error: (error) => {
        this.toastr.error(error?.error?.message || 'Unable to update template status');
      },
    });
  }

  getPreviewContent(template: SmsTemplate | null): string {
    if (!template) {
      return '';
    }
    return template.sampleContent?.trim() || template.templateContent || '';
  }

  trackById(_: number, item: SmsTemplate): string {
    return item._id;
  }

  private loadTemplates(): void {
    this.isLoading = true;
    this.smsTemplateService
      .getTemplates({ includeInactive: true })
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: (response) => {
          this.templates = response.success && Array.isArray(response.data) ? response.data : [];
          this.applyFilter();
        },
        error: () => {
          this.templates = [];
          this.filteredTemplates = [];
          this.toastr.error('Unable to load SMS templates');
        },
      });
  }

  private applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredTemplates = [...this.templates];
      return;
    }

    this.filteredTemplates = this.templates.filter((template) => {
      const haystack = [
        template.templateId,
        template.templateName,
        template.templateContent,
        template.sampleContent,
        template.senderId,
        template.category,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }
}
