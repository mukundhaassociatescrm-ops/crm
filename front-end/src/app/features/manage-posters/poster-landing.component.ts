import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PosterService, PublicPoster } from './poster.service';

@Component({
  selector: 'app-poster-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './poster-landing.component.html',
  styleUrl: './poster-landing.component.scss',
})
export class PosterLandingComponent implements OnInit {
  poster: PublicPoster | null = null;
  isLoading = true;
  notFound = false;

  readonly whatsappNumber = '919363069948';
  readonly callNumbers = ['918508169948', '916379680872'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly posterService: PosterService,
  ) {}

  ngOnInit(): void {
    const slug = String(this.route.snapshot.paramMap.get('slug') || '').trim();
    if (!slug) {
      this.isLoading = false;
      this.notFound = true;
      return;
    }

    this.posterService.getPublicBySlug(slug).subscribe({
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

  get whatsappLink(): string {
    const text = encodeURIComponent(`Hi Mukundha Associates, I viewed "${this.poster?.title || 'your poster'}".`);
    return `https://wa.me/${this.whatsappNumber}?text=${text}`;
  }

  get primaryCallLink(): string {
    return `tel:+${this.callNumbers[0]}`;
  }
}
