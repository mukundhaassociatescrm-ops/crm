import { Component } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MARKETING_TRUSTED } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-trusted',
  standalone: true,
  imports: [MarketingRevealDirective],
  templateUrl: './trusted.component.html',
  styleUrl: './trusted.component.scss',
})
export class MarketingTrustedComponent {
  readonly logos = MARKETING_TRUSTED;
}
