import { Component, input } from '@angular/core';

@Component({
  selector: 'app-marketing-section-heading',
  standalone: true,
  template: `
    <header class="mkt-heading">
      @if (eyebrow()) {
        <p class="mkt-heading__eyebrow">{{ eyebrow() }}</p>
      }
      <h2 class="mkt-heading__title">{{ title() }}</h2>
      @if (subtitle()) {
        <p class="mkt-heading__subtitle">{{ subtitle() }}</p>
      }
    </header>
  `,
  styles: [`
    .mkt-heading {
      max-width: 40rem;
      margin: 0 0 2.75rem;
    }
    .mkt-heading__eyebrow {
      margin: 0 0 0.65rem;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1e3a8a;
    }
    .mkt-heading__title {
      margin: 0;
      font-size: clamp(1.75rem, 3.2vw, 2.5rem);
      line-height: 1.15;
      letter-spacing: -0.03em;
      color: #0f172a;
      font-weight: 750;
    }
    .mkt-heading__subtitle {
      margin: 0.9rem 0 0;
      font-size: 1.05rem;
      line-height: 1.65;
      color: #64748b;
    }
  `],
})
export class MarketingSectionHeadingComponent {
  readonly eyebrow = input('');
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
