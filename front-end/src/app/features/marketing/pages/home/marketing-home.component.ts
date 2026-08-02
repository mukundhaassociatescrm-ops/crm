import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { MarketingNavbarComponent } from '../../components/navbar/navbar.component';
import { MarketingHeroComponent } from '../../components/hero/hero.component';
import { MarketingTrustedComponent } from '../../components/trusted/trusted.component';
import { MarketingServicesComponent } from '../../components/services/services.component';
import { MarketingWhyUsComponent } from '../../components/why-us/why-us.component';
import { MarketingProcessComponent } from '../../components/process/process.component';
import { MarketingIndustriesComponent } from '../../components/industries/industries.component';
import { MarketingTestimonialsComponent } from '../../components/testimonials/testimonials.component';
import { MarketingBlogPreviewComponent } from '../../components/blog-preview/blog-preview.component';
import { MarketingFaqComponent } from '../../components/faq/faq.component';
import { MarketingContactComponent } from '../../components/contact/contact.component';
import { MarketingFooterComponent } from '../../components/footer/footer.component';
import { MARKETING_BRAND } from '../../data/marketing.content';

const MARKETING_PAGE_CLASS = 'marketing-website-page';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [
    CommonModule,
    MarketingNavbarComponent,
    MarketingHeroComponent,
    MarketingTrustedComponent,
    MarketingServicesComponent,
    MarketingWhyUsComponent,
    MarketingProcessComponent,
    MarketingIndustriesComponent,
    MarketingTestimonialsComponent,
    MarketingBlogPreviewComponent,
    MarketingFaqComponent,
    MarketingContactComponent,
    MarketingFooterComponent,
  ],
  templateUrl: './marketing-home.component.html',
  styleUrl: './marketing-home.component.scss',
})
export class MarketingHomeComponent implements OnInit, OnDestroy {
  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
  ) {}

  ngOnInit(): void {
    document.documentElement.classList.add(MARKETING_PAGE_CLASS);
    document.body.classList.add(MARKETING_PAGE_CLASS);

    this.title.setTitle(`${MARKETING_BRAND.name} | Tax & Business Compliance`);
    this.meta.updateTag({
      name: 'description',
      content:
        'Mukundha Associates — premium tax, GST, accounting, and compliance advisory for growing businesses in Coimbatore and across India.',
    });
    this.meta.updateTag({
      name: 'keywords',
      content: 'chartered accountant, GST filing, income tax, Coimbatore CA, business compliance',
    });

    // TODO: Inject Organization / LocalBusiness JSON-LD from API-driven firm profile.
  }

  ngOnDestroy(): void {
    document.documentElement.classList.remove(MARKETING_PAGE_CLASS);
    document.body.classList.remove(MARKETING_PAGE_CLASS);
  }
}
