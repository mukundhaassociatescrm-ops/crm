import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Report, ReportBankDetails, ReportItem, ReportPayload } from '../report.service';
import { ReportPreviewComponent } from '../report-preview/report-preview.component';
import { DateTimePickerComponent } from '../../../shared/components/date-time-picker/date-time-picker.component';

@Component({
  selector: 'app-report-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ReportPreviewComponent, DateTimePickerComponent],
  templateUrl: './report-form.component.html',
  styleUrls: ['./report-form.component.scss']
})
export class ReportFormComponent implements OnChanges {
  @Input() initialReport: Report | null = null;
  @Input() viewMode = false;
  @Input() editMode = false;
  @Input() defaultBankDetails: ReportBankDetails | null = null;

  @Output() save = new EventEmitter<ReportPayload>();
  @Output() cancel = new EventEmitter<void>();

  readonly taxRate = 0.09;

  readonly form = this.fb.group({
    date: ['', Validators.required],
    placeOfSupply: ['', Validators.required],
    status: ['Pending', Validators.required],
    client: this.fb.group({
      name: ['', Validators.required],
      address: ['', Validators.required],
      gst: ['', Validators.required],
    }),
    items: this.fb.array([this.buildItemGroup()]),
    bankDetails: this.fb.group({
      bankName: ['', Validators.required],
      accountNumber: ['', Validators.required],
      ifsc: ['', Validators.required],
    }),
    declaration: ['We declare that this invoice shows the actual price of the services described.', Validators.required],
  });

  constructor(private readonly fb: FormBuilder) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialReport']) {
      this.patchFromReport(this.initialReport);
    }

    if (changes['defaultBankDetails'] && !this.initialReport) {
      this.applyDefaultBankDetails();
    }

    if (this.viewMode) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
      // Company bank account is managed in admin profile, not in report form.
      this.form.get('bankDetails')?.disable({ emitEvent: false });
    }
  }

  get itemsArray(): FormArray<FormGroup> {
    return this.form.get('items') as FormArray<FormGroup>;
  }

  get subtotal(): number {
    return this.round2(this.taxableSubtotal + this.nonTaxableSubtotal);
  }

  get taxableSubtotal(): number {
    return this.sumItemsByTaxability(true);
  }

  get nonTaxableSubtotal(): number {
    return this.sumItemsByTaxability(false);
  }

  get cgst(): number {
    return this.round2(this.taxableSubtotal * this.taxRate);
  }

  get sgst(): number {
    return this.round2(this.taxableSubtotal * this.taxRate);
  }

  get total(): number {
    return this.round2(this.taxableSubtotal + this.cgst + this.sgst + this.nonTaxableSubtotal);
  }

  get previewData(): Partial<Report> {
    const raw = this.form.getRawValue();
    return {
      invoiceNumber: this.initialReport?.invoiceNumber || 'Draft',
      date: raw.date || new Date().toISOString(),
      placeOfSupply: raw.placeOfSupply || '',
      status: (raw.status as 'Paid' | 'Pending') || 'Pending',
      client: {
        name: raw.client?.name || '',
        address: raw.client?.address || '',
        gst: raw.client?.gst || '',
      },
      items: this.normalizedItems,
      subtotal: this.subtotal,
      taxableSubtotal: this.taxableSubtotal,
      nonTaxableSubtotal: this.nonTaxableSubtotal,
      cgst: this.cgst,
      sgst: this.sgst,
      total: this.total,
      bankDetails: {
        bankName: raw.bankDetails?.bankName || '',
        accountNumber: raw.bankDetails?.accountNumber || '',
        ifsc: raw.bankDetails?.ifsc || '',
      },
      declaration: raw.declaration || '',
    };
  }

  get normalizedItems(): ReportItem[] {
    return this.itemsArray.controls.map((control) => {
      const quantity = Number(control.get('quantity')?.value);
      const rate = Number(control.get('rate')?.value);
      const amount = Number(control.get('amount')?.value);

      const subDesc = String(control.get('subDescription')?.value || '').trim();
      return {
        description: String(control.get('description')?.value || '').trim(),
        subDescription: subDesc || undefined,
        hsn: String(control.get('hsn')?.value || '').trim(),
        quantity: Number.isFinite(quantity) ? quantity : undefined,
        rate: Number.isFinite(rate) ? rate : undefined,
        amount: this.round2(Number.isFinite(amount) ? amount : 0),
      };
    }).filter((item) => item.description || item.hsn || item.amount > 0);
  }

  addItem(): void {
    this.itemsArray.push(this.buildItemGroup());
  }

  removeItem(index: number): void {
    if (this.itemsArray.length <= 1) {
      return;
    }
    this.itemsArray.removeAt(index);
  }

  updateAmountFromQtyRate(index: number): void {
    const item = this.itemsArray.at(index);
    const quantity = Number(item.get('quantity')?.value);
    const rate = Number(item.get('rate')?.value);

    if (Number.isFinite(quantity) && Number.isFinite(rate)) {
      item.get('amount')?.setValue(this.round2(quantity * rate), { emitEvent: false });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || !this.normalizedItems.length) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: ReportPayload = {
      date: this.normalizeDateTimeForApi(String(raw.date || '')),
      placeOfSupply: raw.placeOfSupply || '',
      status: (raw.status as 'Paid' | 'Pending') || 'Pending',
      client: {
        name: raw.client?.name || '',
        address: raw.client?.address || '',
        gst: raw.client?.gst || '',
      },
      items: this.normalizedItems,
      bankDetails: {
        bankName: raw.bankDetails?.bankName || '',
        accountNumber: raw.bankDetails?.accountNumber || '',
        ifsc: raw.bankDetails?.ifsc || '',
      },
      declaration: raw.declaration || '',
    };

    this.save.emit(payload);
  }

  private patchFromReport(report: Report | null): void {
    if (!report) {
      this.form.reset({
        date: this.formatDateTimeInput(new Date().toISOString()),
        placeOfSupply: '',
        status: 'Pending',
        client: {
          name: '',
          address: '',
          gst: '',
        },
        bankDetails: {
          bankName: '',
          accountNumber: '',
          ifsc: '',
        },
        declaration: 'We declare that this invoice shows the actual price of the services described.',
      });
      this.itemsArray.clear();
      this.itemsArray.push(this.buildItemGroup());
      this.applyDefaultBankDetails();
      return;
    }

    this.form.patchValue({
      date: this.formatDateTimeInput(report.date),
      placeOfSupply: report.placeOfSupply,
      status: report.status,
      client: report.client,
      bankDetails: report.bankDetails,
      declaration: report.declaration,
    });

    this.itemsArray.clear();
    report.items.forEach((item) => {
      this.itemsArray.push(this.buildItemGroup(item));
    });

    if (!report.items.length) {
      this.itemsArray.push(this.buildItemGroup());
    }

    this.form.get('bankDetails')?.disable({ emitEvent: false });
  }

  private applyDefaultBankDetails(): void {
    if (!this.defaultBankDetails) {
      return;
    }

    this.form.patchValue({
      bankDetails: {
        bankName: this.defaultBankDetails.bankName,
        accountNumber: this.defaultBankDetails.accountNumber,
        ifsc: this.defaultBankDetails.ifsc,
      },
    });
    this.form.get('bankDetails')?.disable({ emitEvent: false });
  }

  private buildItemGroup(item?: Partial<ReportItem>): FormGroup {
    return this.fb.group({
      description: [item?.description || '', Validators.required],
      subDescription: [item?.subDescription || ''],
      hsn: [item?.hsn || ''],
      quantity: [item?.quantity ?? ''],
      rate: [item?.rate ?? ''],
      amount: [item?.amount ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  private sumItemsByTaxability(taxable: boolean): number {
    const sum = this.itemsArray.controls.reduce((total, control) => {
      const hsn = String(control.get('hsn')?.value || '').trim();
      const amount = Number(control.get('amount')?.value) || 0;
      return Boolean(hsn) === taxable ? total + amount : total;
    }, 0);

    return this.round2(sum);
  }

  private round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  private formatDateTimeInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  private normalizeDateTimeForApi(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return this.formatDateTimeInput(new Date().toISOString());
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return this.formatDateTimeInput(new Date().toISOString());
    }

    return this.formatDateTimeInput(date.toISOString());
  }
}
