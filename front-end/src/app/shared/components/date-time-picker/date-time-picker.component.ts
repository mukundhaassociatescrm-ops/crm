import { AfterViewInit, Component, ElementRef, forwardRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import flatpickr from 'flatpickr';
import type { Instance } from 'flatpickr/dist/types/instance';

@Component({
  selector: 'app-date-time-picker',
  standalone: true,
  templateUrl: './date-time-picker.component.html',
  styleUrls: ['./date-time-picker.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateTimePickerComponent),
      multi: true,
    },
  ],
})
export class DateTimePickerComponent implements ControlValueAccessor, AfterViewInit, OnDestroy {
  @Input() placeholder = 'Select date and time';
  @Input() defaultToCurrentTime = false;
  @Input() enableSeconds = false;

  @ViewChild('pickerInput', { static: true }) pickerInput!: ElementRef<HTMLInputElement>;

  private flatpickrInstance: Instance | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private pendingValue: string | null = null;
  private hasExternalValue = false;
  isDisabled = false;

  ngAfterViewInit(): void {
    this.flatpickrInstance = flatpickr(this.pickerInput.nativeElement, {
      enableTime: true,
      enableSeconds: this.enableSeconds,
      time_24hr: true,
      monthSelectorType: 'dropdown',
      dateFormat: this.enableSeconds ? 'd-m-Y H:i:S' : 'd-m-Y H:i',
      disableMobile: true,
      onChange: (selectedDates) => {
        const selectedDate = selectedDates[0];
        this.onChange(selectedDate ? this.toIsoLocal(selectedDate) : '');
      },
      onClose: () => {
        this.onTouched();
      },
      onReady: () => {
        if (this.pendingValue) {
          this.setPickerDate(this.pendingValue);
          this.pendingValue = null;
          this.hasExternalValue = true;
          return;
        }

        if (this.defaultToCurrentTime && !this.hasExternalValue) {
          const now = new Date();
          this.flatpickrInstance?.setDate(now, false);
          this.onChange(this.toIsoLocal(now));
        }
      },
    });
  }

  writeValue(value: string | null): void {
    if (!value) {
      this.hasExternalValue = false;
      this.pendingValue = null;
      this.flatpickrInstance?.clear();
      return;
    }

    this.hasExternalValue = true;

    if (!this.flatpickrInstance) {
      this.pendingValue = value;
      return;
    }

    this.setPickerDate(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    this.flatpickrInstance?.set('clickOpens', !isDisabled);
    if (this.flatpickrInstance) {
      this.flatpickrInstance.input.disabled = isDisabled;
    }
  }

  ngOnDestroy(): void {
    this.flatpickrInstance?.destroy();
  }

  markTouched(): void {
    this.onTouched();
  }

  private setPickerDate(value: string): void {
    const parsedDate = this.parseValue(value);
    if (parsedDate) {
      this.flatpickrInstance?.setDate(parsedDate, false);
    }
  }

  private parseValue(value: string): Date | null {
    const isoDate = new Date(value);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate;
    }

    const normalized = value.trim().replace(' ', 'T');
    const [datePart, timePart] = normalized.split('T');
    if (!datePart || !timePart) {
      return null;
    }

    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(Number);

    const parsed = new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private toIsoLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
}