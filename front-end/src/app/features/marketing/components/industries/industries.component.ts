import { Component } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_INDUSTRIES } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-industries',
  standalone: true,
  imports: [MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './industries.component.html',
  styleUrl: './industries.component.scss',
})
export class MarketingIndustriesComponent {
  readonly industries = MARKETING_INDUSTRIES;
}
