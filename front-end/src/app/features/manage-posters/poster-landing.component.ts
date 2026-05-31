import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PosterService, PublicPoster } from './poster.service';

const POSTER_LANDING_BODY_CLASS = 'poster-landing-page';

@Component({
  selector: 'app-poster-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './poster-landing.component.html',
  styleUrl: './poster-landing.component.scss',
})
export class PosterLandingComponent implements OnInit, OnDestroy {
  poster: PublicPoster | null = null;
  isLoading = true;
  notFound = false;
  private routeSlug = '';

  readonly whatsappNumber = '919363069948';
  readonly callNumbers = ['918508169948', '916379680872'];
  readonly services = [
    'Income Tax Return Filing',
    'GST Filing',
    'Accounting Services',
    'Tax Consultation',
  ];

  zoomOpen = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly posterService: PosterService,
  ) {}

  ngOnInit(): void {
    document.documentElement.classList.add(POSTER_LANDING_BODY_CLASS);
    document.body.classList.add(POSTER_LANDING_BODY_CLASS);

    this.routeSlug = String(this.route.snapshot.paramMap.get('slug') || '').trim().toLowerCase();
    if (!this.routeSlug) {
      this.isLoading = false;
      this.notFound = true;
      return;
    }

    this.posterService.getPublicBySlug(this.routeSlug).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.success || !res.data) {
          this.notFound = true;
          return;
        }
        this.poster = res.data;
      },
      error: () => {
        this.isLoading = false;
        this.notFound = true;
      },
    });
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove(POSTER_LANDING_BODY_CLASS);
    document.body.classList.remove(POSTER_LANDING_BODY_CLASS);
  }

  /** Human-readable title only — never show slug values like template-5. */
  get displayTitle(): string {
    const title = String(this.poster?.title || '').trim();
    if (!title || this.isSlugLikeTitle(title)) {
      return '';
    }
    return title;
  }

  get whatsappLink(): string {
    const label = this.displayTitle || 'your poster';
    const text = encodeURIComponent(`Hi Mukundha Associates, I viewed "${label}".`);
    return `https://wa.me/${this.whatsappNumber}?text=${text}`;
  }

  get primaryCallLink(): string {
    return `tel:+${this.callNumbers[0]}`;
  }

  openZoom(): void {
    this.zoomOpen = true;
  }

  closeZoom(): void {
    this.zoomOpen = false;
  }

  private isSlugLikeTitle(title: string): boolean {
    const normalized = title.trim().toLowerCase();
    const slug = String(this.poster?.slug || this.routeSlug || '').trim().toLowerCase();
    if (slug && normalized === slug) {
      return true;
    }
    if (/^template-\d+$/i.test(normalized)) {
      return true;
    }
    return false;
  }
}
