import { Component, signal } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_FAQS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-faq',
  standalone: true,
  imports: [MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
})
export class MarketingFaqComponent {
  readonly faqs = MARKETING_FAQS;
  readonly openIndex = signal(0);

  toggle(index: number): void {
    this.openIndex.update((current) => (current === index ? -1 : index));
  }
}
