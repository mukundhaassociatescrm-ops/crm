import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MARKETING_BRAND, MARKETING_NAV_LINKS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class MarketingNavbarComponent implements OnInit, OnDestroy {
  readonly brand = MARKETING_BRAND;
  readonly links = MARKETING_NAV_LINKS;
  readonly scrolled = signal(false);
  readonly menuOpen = signal(false);

  ngOnInit(): void {
    this.onWindowScroll();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.scrolled.set(window.scrollY > 18);
  }

  toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    document.body.style.overflow = next ? 'hidden' : '';
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    document.body.style.overflow = '';
  }

  scrollTo(fragment: string, event?: Event): void {
    event?.preventDefault();
    this.closeMenu();
    const el = document.getElementById(fragment);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
