import { Component } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_SERVICES } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-services',
  standalone: true,
  imports: [MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
})
export class MarketingServicesComponent {
  readonly services = MARKETING_SERVICES;

  scrollToContact(event: Event): void {
    event.preventDefault();
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  }
}
