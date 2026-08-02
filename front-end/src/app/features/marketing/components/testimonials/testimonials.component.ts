import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import gsap from 'gsap';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_TESTIMONIALS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-testimonials',
  standalone: true,
  imports: [CommonModule, MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './testimonials.component.html',
  styleUrl: './testimonials.component.scss',
})
export class MarketingTestimonialsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;

  readonly items = MARKETING_TESTIMONIALS;
  readonly active = signal(0);
  private timerId?: number;

  ngAfterViewInit(): void {
    this.timerId = window.setInterval(() => this.next(), 5200);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
    }
  }

  next(): void {
    const nextIndex = (this.active() + 1) % this.items.length;
    this.goTo(nextIndex);
  }

  prev(): void {
    const prevIndex = (this.active() - 1 + this.items.length) % this.items.length;
    this.goTo(prevIndex);
  }

  goTo(index: number): void {
    this.active.set(index);
    const track = this.trackRef?.nativeElement;
    if (!track) {
      return;
    }
    gsap.to(track, {
      xPercent: -100 * index,
      duration: 0.65,
      ease: 'power3.out',
    });
  }
}
