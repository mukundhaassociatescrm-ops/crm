import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type AutocompleteHighlightPart = {
  text: string;
  match: boolean;
};

@Component({
  selector: 'app-autocomplete-text',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './autocomplete-text.component.html',
  styleUrls: ['./autocomplete-text.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AutocompleteTextComponent),
      multi: true,
    },
  ],
})
export class AutocompleteTextComponent implements ControlValueAccessor, OnChanges {
  @Input() suggestions: readonly string[] = [];
  @Input() placeholder = '';
  @Input() inputId = '';
  /** When true, empty query shows all suggestions on focus. */
  @Input() showAllOnFocus = true;

  @ViewChild('textInput') private textInput?: ElementRef<HTMLInputElement>;

  value = '';
  isDisabled = false;
  isOpen = false;
  activeIndex = -1;
  filteredSuggestions: string[] = [];

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  /** True while a suggestion pointer interaction is in progress. */
  private selectingSuggestion = false;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['suggestions'] && this.isOpen) {
      this.refreshFilteredSuggestions();
      if (!this.filteredSuggestions.length) {
        this.closeDropdown();
      }
    }
  }

  writeValue(value: string | null): void {
    this.value = value == null ? '' : String(value);
    if (this.isOpen) {
      this.refreshFilteredSuggestions();
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (isDisabled) {
      this.closeDropdown();
    }
  }

  get showDropdown(): boolean {
    return this.isOpen && !this.isDisabled && this.filteredSuggestions.length > 0;
  }

  onInput(event: Event): void {
    const next = String((event.target as HTMLInputElement)?.value || '');
    this.value = next;
    this.onChange(next);
    this.refreshFilteredSuggestions();
    this.isOpen = this.filteredSuggestions.length > 0;
    this.activeIndex = this.filteredSuggestions.length ? 0 : -1;
  }

  onFocus(): void {
    if (this.isDisabled) {
      return;
    }
    this.refreshFilteredSuggestions();
    this.isOpen = this.filteredSuggestions.length > 0;
    this.activeIndex = this.filteredSuggestions.length ? 0 : -1;
  }

  onBlur(): void {
    this.onTouched();
    // Selection uses pointerdown + preventDefault, so blur should not run during
    // a suggestion press. If focus left the control (e.g. Tab), close shortly after.
    queueMicrotask(() => {
      if (this.selectingSuggestion) {
        return;
      }
      if (!this.host.nativeElement.contains(document.activeElement)) {
        this.closeDropdown();
      }
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.isDisabled) {
      return;
    }

    if (event.key === 'Escape') {
      if (this.isOpen) {
        event.preventDefault();
        event.stopPropagation();
        this.closeDropdown();
      }
      return;
    }

    if (!this.showDropdown) {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && this.filteredSuggestions.length) {
        event.preventDefault();
        this.isOpen = true;
        this.activeIndex = event.key === 'ArrowUp' ? this.filteredSuggestions.length - 1 : 0;
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % this.filteredSuggestions.length;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = this.activeIndex <= 0
        ? this.filteredSuggestions.length - 1
        : this.activeIndex - 1;
      return;
    }

    if (event.key === 'Enter') {
      if (this.activeIndex >= 0 && this.activeIndex < this.filteredSuggestions.length) {
        event.preventDefault();
        this.selectSuggestion(this.filteredSuggestions[this.activeIndex]);
      }
    }
  }

  /**
   * Commit on pointerdown (before blur/click). Waiting for click is unreliable:
   * blur → onTouched → parent CD can destroy *ngIf list nodes before click fires.
   */
  onSuggestionPointerDown(event: PointerEvent, suggestion: string): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.selectingSuggestion = true;
    this.selectSuggestion(suggestion);
    this.selectingSuggestion = false;
  }

  selectSuggestion(suggestion: string): void {
    this.value = suggestion;
    this.onChange(suggestion);
    this.onTouched();
    this.closeDropdown();
    queueMicrotask(() => this.textInput?.nativeElement.focus());
  }

  onSuggestionMouseEnter(index: number): void {
    this.activeIndex = index;
  }

  trackBySuggestion(_: number, item: string): string {
    return item;
  }

  getHighlightParts(suggestion: string): AutocompleteHighlightPart[] {
    const query = this.value.trim();
    if (!query) {
      return [{ text: suggestion, match: false }];
    }

    const lowerSuggestion = suggestion.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const parts: AutocompleteHighlightPart[] = [];
    let cursor = 0;

    while (cursor < suggestion.length) {
      const matchAt = lowerSuggestion.indexOf(lowerQuery, cursor);
      if (matchAt < 0) {
        parts.push({ text: suggestion.slice(cursor), match: false });
        break;
      }

      if (matchAt > cursor) {
        parts.push({ text: suggestion.slice(cursor, matchAt), match: false });
      }

      parts.push({
        text: suggestion.slice(matchAt, matchAt + query.length),
        match: true,
      });
      cursor = matchAt + query.length;
    }

    return parts.length ? parts : [{ text: suggestion, match: false }];
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.isOpen) {
      return;
    }
    const target = event.target as Node | null;
    if (!target || this.host.nativeElement.contains(target)) {
      return;
    }
    this.closeDropdown();
  }

  private refreshFilteredSuggestions(): void {
    const term = this.value.trim().toLowerCase();
    if (!term) {
      this.filteredSuggestions = this.showAllOnFocus ? [...this.suggestions] : [];
      return;
    }

    this.filteredSuggestions = this.suggestions.filter((item) =>
      item.toLowerCase().includes(term),
    );
  }

  private closeDropdown(): void {
    this.isOpen = false;
    this.activeIndex = -1;
  }
}
