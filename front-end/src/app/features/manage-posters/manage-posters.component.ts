import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';
import { POSTER_CATEGORIES, Poster, PosterService } from './poster.service';
import { PosterFormComponent } from './poster-form.component';

@Component({
  selector: 'app-manage-posters',
  standalone: true,
  imports: [CommonModule, FormsModule, FullscreenToggleComponent, PosterFormComponent],
  templateUrl: './manage-posters.component.html',
  styleUrl: './manage-posters.component.scss',
})
export class ManagePostersComponent implements OnInit {
  posters: Poster[] = [];
  categories = [...POSTER_CATEGORIES];
  search = '';
  categoryFilter = '';
  page = 1;
  pageSize = 25;
  total = 0;
  totalPages = 1;
  isLoading = false;

  showForm = false;
  editingPoster: Poster | null = null;
  viewPoster: Poster | null = null;

  readonly pageSizeOptions = [25, 50, 100];

  constructor(
    private readonly posterService: PosterService,
    private readonly toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadPosters();
  }

  loadPosters(): void {
    this.isLoading = true;
    this.posterService
      .list({
        page: this.page,
        limit: this.pageSize,
        search: this.search,
        category: this.categoryFilter,
      })
      .pipe(finalize(() => {
        this.isLoading = false;
      }))
      .subscribe({
        next: (res) => {
          this.posters = res.success ? res.data || [] : [];
          this.total = res.pagination?.total || 0;
          this.totalPages = res.pagination?.totalPages || 1;
        },
        error: () => {
          this.posters = [];
          this.toastr.error('Failed to load posters', 'Error');
        },
      });
  }

  onSearch(): void {
    this.page = 1;
    this.loadPosters();
  }

  onPageSizeChange(): void {
    this.page = 1;
    this.loadPosters();
  }

  goPage(next: number): void {
    if (next < 1 || next > this.totalPages) {
      return;
    }
    this.page = next;
    this.loadPosters();
  }

  openCreate(): void {
    this.editingPoster = null;
    this.showForm = true;
  }

  openEdit(poster: Poster): void {
    this.editingPoster = poster;
    this.showForm = true;
  }

  openView(poster: Poster): void {
    this.viewPoster = poster;
  }

  closeView(): void {
    this.viewPoster = null;
  }

  onFormClosed(saved: boolean): void {
    this.showForm = false;
    this.editingPoster = null;
    if (saved) {
      this.loadPosters();
    }
  }

  copyLink(poster: Poster): void {
    const url = poster.landingUrl || this.posterService.buildLandingUrl(poster.slug);
    navigator.clipboard.writeText(url).then(() => {
      this.toastr.success('Landing page link copied', 'Copied');
    }).catch(() => {
      this.toastr.info(url, 'Landing URL');
    });
  }

  toggleStatus(poster: Poster): void {
    this.posterService.setStatus(poster._id, !poster.isActive).subscribe({
      next: (res) => {
        if (!res.success) {
          this.toastr.error('Unable to update status', 'Error');
          return;
        }
        poster.isActive = res.data.isActive;
        this.toastr.success(poster.isActive ? 'Poster activated' : 'Poster deactivated', 'Updated');
      },
      error: () => this.toastr.error('Unable to update status', 'Error'),
    });
  }

  deletePoster(poster: Poster): void {
    if (!confirm(`Delete poster "${poster.title}"?`)) {
      return;
    }
    this.posterService.delete(poster._id).subscribe({
      next: (res) => {
        if (!res.success) {
          this.toastr.error(res.message || 'Delete failed', 'Error');
          return;
        }
        this.toastr.success('Poster deleted', 'Deleted');
        this.loadPosters();
      },
      error: () => this.toastr.error('Delete failed', 'Error'),
    });
  }

  posterStatusLabel(poster: Poster): string {
    return poster.isActive ? 'Active' : 'Inactive';
  }

  trackPoster(_: number, poster: Poster): string {
    return poster._id;
  }
}
