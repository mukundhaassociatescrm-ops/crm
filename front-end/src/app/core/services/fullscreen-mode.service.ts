import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

const STORAGE_PREFIX = 'mukundha-crm:fullscreen:';

@Injectable({ providedIn: 'root' })
export class FullscreenModeService implements OnDestroy {
  private readonly activeKeySubject = new BehaviorSubject<string | null>(null);
  readonly activeKey$ = this.activeKeySubject.asObservable();

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return;
    }

    const activeKey = this.activeKeySubject.value;
    if (!activeKey) {
      return;
    }

    event.preventDefault();
    this.disable(activeKey);
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.onKeyDown);
    }
  }

  ngOnDestroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.onKeyDown);
    }
  }

  getActiveKey(): string | null {
    return this.activeKeySubject.value;
  }

  isActiveFor(pageKey: string): boolean {
    return this.activeKeySubject.value === pageKey;
  }

  isStored(pageKey: string): boolean {
    return this.readStored(pageKey);
  }

  /** Apply stored preference when entering a route (does not enable if user turned it off). */
  syncRoute(pageKey: string | null): void {
    if (!pageKey) {
      this.deactivateLayout();
      return;
    }

    if (this.readStored(pageKey)) {
      this.enable(pageKey, { persist: false });
      return;
    }

    if (this.activeKeySubject.value === pageKey) {
      this.deactivateLayout();
    }
  }

  toggle(pageKey: string): void {
    if (this.isActiveFor(pageKey)) {
      this.disable(pageKey);
      return;
    }

    this.enable(pageKey);
  }

  enable(pageKey: string, options: { persist?: boolean } = {}): void {
    const persist = options.persist !== false;
    if (persist) {
      this.writeStored(pageKey, true);
    }

    this.activeKeySubject.next(pageKey);
    this.applyBodyClass(true);
    console.log('[FULLSCREEN ENABLED]', { pageKey });
  }

  disable(pageKey?: string): void {
    const resolvedKey = pageKey || this.activeKeySubject.value;
    if (!resolvedKey) {
      return;
    }

    this.writeStored(resolvedKey, false);
    this.deactivateLayout();
    console.log('[FULLSCREEN DISABLED]', { pageKey: resolvedKey });
  }

  private deactivateLayout(): void {
    this.activeKeySubject.next(null);
    this.applyBodyClass(false);
  }

  private applyBodyClass(enabled: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.body.classList.toggle('fullscreen-mode', enabled);
    document.body.classList.remove('chat-fullscreen');
  }

  private readStored(pageKey: string): boolean {
    try {
      return localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`) === 'true';
    } catch {
      return false;
    }
  }

  private writeStored(pageKey: string, enabled: boolean): void {
    try {
      const storageKey = `${STORAGE_PREFIX}${pageKey}`;
      if (enabled) {
        localStorage.setItem(storageKey, 'true');
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage failures (private mode, quota, etc.)
    }
  }
}
