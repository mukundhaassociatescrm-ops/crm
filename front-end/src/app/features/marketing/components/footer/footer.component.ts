import { Component } from '@angular/core';
import { MARKETING_BRAND, MARKETING_CONTACT, MARKETING_NAV_LINKS, MARKETING_SERVICES } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-footer',
  standalone: true,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class MarketingFooterComponent {
  readonly brand = MARKETING_BRAND;
  readonly links = MARKETING_NAV_LINKS;
  readonly services = MARKETING_SERVICES.slice(0, 4);
  readonly contact = MARKETING_CONTACT;
  readonly year = new Date().getFullYear();

  scrollTo(fragment: string, event: Event): void {
    event.preventDefault();
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth' });
  }
}
