import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_CONTACT } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-contact',
  standalone: true,
  imports: [ReactiveFormsModule, MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class MarketingContactComponent {
  readonly info = MARKETING_CONTACT;
  readonly submitted = signal(false);
  readonly submitting = signal(false);

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.minLength(10)]],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  get whatsappHref(): string {
    const text = encodeURIComponent('Hi Mukundha Associates, I would like to discuss compliance support.');
    return `https://wa.me/${this.info.whatsapp}?text=${text}`;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    // TODO: POST lead payload to CRM / marketing API endpoint.
    window.setTimeout(() => {
      this.submitting.set(false);
      this.submitted.set(true);
      this.form.reset();
    }, 700);
  }
}
