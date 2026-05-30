import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { POSTER_CATEGORIES, Poster, PosterService } from './poster.service';

@Component({
  selector: 'app-poster-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './poster-form.component.html',
  styleUrl: './poster-form.component.scss',
})
export class PosterFormComponent implements OnChanges {
  @Input() poster: Poster | null = null;
  @Output() closed = new EventEmitter<boolean>();

  categories = [...POSTER_CATEGORIES];
  title = '';
  slug = '';
  category: string = 'General Announcement';
  shortDescription = '';
  content = '';
  isActive = true;
  imageFile: File | null = null;
  imagePreview = '';
  isSaving = false;
  slugTouched = false;

  constructor(
    private readonly posterService: PosterService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['poster']) {
      this.resetForm();
    }
  }

  get isEdit(): boolean {
    return Boolean(this.poster?._id);
  }

  get modalTitle(): string {
    return this.isEdit ? 'Edit Poster' : 'Create Poster';
  }

  onTitleChange(): void {
    if (!this.slugTouched && !this.isEdit) {
      this.slug = this.slugify(this.title);
    }
  }

  onSlugChange(): void {
    this.slugTouched = true;
    this.slug = this.slugify(this.slug);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] || null;
    if (!file) {
      return;
    }
    this.imageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  save(): void {
    if (!this.title.trim()) {
      this.toastr.warning('Title is required', 'Validation');
      return;
    }
    if (!this.isEdit && !this.imageFile) {
      this.toastr.warning('Poster image is required', 'Validation');
      return;
    }

    const formData = new FormData();
    formData.append('title', this.title.trim());
    formData.append('slug', this.slugify(this.slug || this.title));
    formData.append('category', this.category);
    formData.append('shortDescription', this.shortDescription.trim());
    formData.append('content', this.content.trim());
    formData.append('isActive', String(this.isActive));
    if (this.imageFile) {
      formData.append('image', this.imageFile);
    }

    this.isSaving = true;
    const request$ = this.isEdit && this.poster
      ? this.posterService.update(this.poster._id, formData)
      : this.posterService.create(formData);

    request$.pipe(finalize(() => {
      this.isSaving = false;
    })).subscribe({
      next: (res) => {
        if (!res.success) {
          this.toastr.error(res.message || 'Save failed', 'Error');
          return;
        }
        this.toastr.success(this.isEdit ? 'Poster updated' : 'Poster created', 'Success');
        this.closed.emit(true);
      },
      error: (err) => {
        this.toastr.error(err?.error?.message || 'Save failed', 'Error');
      },
    });
  }

  cancel(): void {
    this.closed.emit(false);
  }

  private resetForm(): void {
    this.slugTouched = false;
    if (this.poster) {
      this.title = this.poster.title;
      this.slug = this.poster.slug;
      this.category = this.poster.category || 'Other';
      this.shortDescription = this.poster.shortDescription || '';
      this.content = this.poster.content || '';
      this.isActive = this.poster.isActive;
      this.imagePreview = this.poster.imageUrl;
      this.imageFile = null;
      return;
    }

    this.title = '';
    this.slug = '';
    this.category = 'General Announcement';
    this.shortDescription = '';
    this.content = '';
    this.isActive = true;
    this.imageFile = null;
    this.imagePreview = '';
  }

  private slugify(value: string): string {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }
}
