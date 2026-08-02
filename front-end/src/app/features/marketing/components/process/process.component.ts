import { Component } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_PROCESS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-process',
  standalone: true,
  imports: [MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './process.component.html',
  styleUrl: './process.component.scss',
})
export class MarketingProcessComponent {
  readonly steps = MARKETING_PROCESS;
}
