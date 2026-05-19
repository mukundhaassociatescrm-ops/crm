import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { FullscreenModeService } from '../../../core/services/fullscreen-mode.service';

@Component({
  selector: 'app-fullscreen-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="app-fullscreen-toggle"
      (click)="toggle()"
      [attr.aria-pressed]="enabled"
      [attr.aria-label]="enabled ? 'Exit focus mode' : 'Enter focus mode'"
      [title]="enabled ? 'Exit focus mode (Esc)' : 'Enter focus mode'">
      <span class="app-fullscreen-toggle__icon" aria-hidden="true">{{ enabled ? '⤢' : '⛶' }}</span>
    </button>
  `,
  styleUrl: './fullscreen-toggle.component.scss',
})
export class FullscreenToggleComponent implements OnInit, OnDestroy {
  @Input({ required: true }) pageKey!: string;

  enabled = false;

  private subscription?: Subscription;

  constructor(private readonly fullscreenMode: FullscreenModeService) {}

  ngOnInit(): void {
    this.enabled = this.fullscreenMode.isActiveFor(this.pageKey);
    this.subscription = this.fullscreenMode.activeKey$.subscribe((activeKey) => {
      this.enabled = activeKey === this.pageKey;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toggle(): void {
    this.fullscreenMode.toggle(this.pageKey);
  }
}
