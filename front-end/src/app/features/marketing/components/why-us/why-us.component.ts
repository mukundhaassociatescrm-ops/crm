import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_FEATURES, MARKETING_STATS } from '../../data/marketing.content';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-marketing-why-us',
  standalone: true,
  imports: [MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './why-us.component.html',
  styleUrl: './why-us.component.scss',
})
export class MarketingWhyUsComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('statValue') statValues!: QueryList<ElementRef<HTMLElement>>;

  readonly features = MARKETING_FEATURES;
  readonly stats = MARKETING_STATS;
  private triggers: ScrollTrigger[] = [];

  ngAfterViewInit(): void {
    this.statValues.forEach((ref, index) => {
      const target = this.stats[index];
      if (!target) {
        return;
      }
      const obj = { val: 0 };
      const trigger = ScrollTrigger.create({
        trigger: ref.nativeElement,
        start: 'top 90%',
        once: true,
        onEnter: () => {
          gsap.to(obj, {
            val: target.value,
            duration: 1.4,
            ease: 'power2.out',
            onUpdate: () => {
              ref.nativeElement.textContent = `${Math.round(obj.val)}${target.suffix}`;
            },
          });
        },
      });
      this.triggers.push(trigger);
    });
  }

  ngOnDestroy(): void {
    this.triggers.forEach((t) => t.kill());
  }
}
