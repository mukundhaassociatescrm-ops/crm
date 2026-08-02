import { DatePipe } from '@angular/common';
import { Component } from '@angular/core';
import { MarketingRevealDirective } from '../../shared/marketing-reveal.directive';
import { MarketingSectionHeadingComponent } from '../../shared/section-heading.component';
import { MARKETING_BLOG_POSTS } from '../../data/marketing.content';

@Component({
  selector: 'app-marketing-blog-preview',
  standalone: true,
  imports: [DatePipe, MarketingRevealDirective, MarketingSectionHeadingComponent],
  templateUrl: './blog-preview.component.html',
  styleUrl: './blog-preview.component.scss',
})
export class MarketingBlogPreviewComponent {
  readonly posts = MARKETING_BLOG_POSTS;
}
