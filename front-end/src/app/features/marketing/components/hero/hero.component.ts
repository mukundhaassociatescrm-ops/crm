import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import gsap from 'gsap';
import { MARKETING_STATS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
})
export class MarketingHeroComponent implements AfterViewInit, OnDestroy {
  @ViewChild('heroRoot', { static: true }) heroRoot!: ElementRef<HTMLElement>;

  readonly stats = MARKETING_STATS.slice(0, 3);
  private ctx?: gsap.Context;

  ngAfterViewInit(): void {
    const root = this.heroRoot.nativeElement;
    this.ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.mkt-hero__eyebrow', { y: 20, autoAlpha: 0, duration: 0.6 })
        .from('.mkt-hero__title', { y: 36, autoAlpha: 0, duration: 0.8 }, '-=0.25')
        .from('.mkt-hero__sub', { y: 24, autoAlpha: 0, duration: 0.7 }, '-=0.45')
        .from('.mkt-hero__actions a', { y: 18, autoAlpha: 0, stagger: 0.1, duration: 0.55 }, '-=0.35')
        .from('.mkt-hero__panel', { x: 40, autoAlpha: 0, duration: 0.9 }, '-=0.55')
        .from('.mkt-hero__float', { y: 24, autoAlpha: 0, stagger: 0.12, duration: 0.6 }, '-=0.45');

      gsap.to('.mkt-hero__orb--one', { y: 18, duration: 4, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.mkt-hero__orb--two', { y: -16, duration: 5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }, root);
  }

  ngOnDestroy(): void {
    this.ctx?.revert();
  }

  scrollTo(fragment: string, event: Event): void {
    event.preventDefault();
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
