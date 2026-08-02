import { Directive, ElementRef, OnDestroy, OnInit, inject, input } from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Directive({
  selector: '[mktReveal]',
  standalone: true,
})
export class MarketingRevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private trigger?: ScrollTrigger;

  /** GSAP y offset in px */
  readonly mktRevealY = input(36);
  readonly mktRevealDelay = input(0);

  ngOnInit(): void {
    const node = this.el.nativeElement;
    gsap.set(node, { autoAlpha: 0, y: this.mktRevealY() });

    this.trigger = ScrollTrigger.create({
      trigger: node,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(node, {
          autoAlpha: 1,
          y: 0,
          duration: 0.85,
          delay: this.mktRevealDelay(),
          ease: 'power3.out',
        });
      },
    });
  }

  ngOnDestroy(): void {
    this.trigger?.kill();
  }
}
