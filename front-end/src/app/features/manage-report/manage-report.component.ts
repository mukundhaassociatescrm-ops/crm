import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { Report, ReportPayload, ReportService } from './report.service';
import { ReportListComponent } from './report-list/report-list.component';
import { ReportFormComponent } from './report-form/report-form.component';
import { AuthService } from '../auth/auth.service';
import { FullscreenToggleComponent } from '../../shared/components/fullscreen-toggle/fullscreen-toggle.component';

const fontVfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs;
if (fontVfs) {
  (pdfMake as any).vfs = fontVfs;
}

type Mode = 'list' | 'create' | 'edit' | 'view';

type CompanyBankDetails = {
  bankName: string;
  accountNumber: string;
  ifsc: string;
};

const DEFAULT_COMPANY_BANK_DETAILS: CompanyBankDetails = {
  bankName: 'State Bank of India, Coimbatore Nagar Branch',
  accountNumber: '44344893154',
  ifsc: 'SBIN0008608',
};

@Component({
  selector: 'app-manage-report',
  standalone: true,
  imports: [CommonModule, ReportListComponent, ReportFormComponent, FullscreenToggleComponent],
  templateUrl: './manage-report.component.html',
  styleUrls: ['./manage-report.component.scss']
})
export class ManageReportComponent implements OnInit {
  reports: Report[] = [];
  loading = false;
  mode: Mode = 'list';
  selectedReport: Report | null = null;
  companyBankDetails: CompanyBankDetails = DEFAULT_COMPANY_BANK_DETAILS;
  private readonly logoPath = 'assets/Logo.png';
  private logoDataUrl: string | null = null;
  private logoLoadPromise: Promise<string | null> | null = null;

  readonly company = {
    name: 'MUKUNDHA ASSOCIATES',
    address: '3rd Floor, 73-27 TF7, Block C, Swamy Iyer New Street, Katteri Chettiar Thottam, Coimbatore - 641001',
    gst: '33CXJPS3712H1ZF',
    state: 'Tamil Nadu, Code: 33',
    email: 'tpksathyan@gmail.com'
  };

  constructor(
    private readonly reportService: ReportService,
    private readonly toastr: ToastrService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.syncCompanyBankDetailsFromSession();
    void this.ensureLogoDataUrl();
    this.loadReports();
  }

  private syncCompanyBankDetailsFromSession(): void {
    const user = this.authService.getUser();
    const bankDetails = user?.bankDetails;
    this.companyBankDetails = {
      bankName: String(bankDetails?.bankName || DEFAULT_COMPANY_BANK_DETAILS.bankName),
      accountNumber: String(bankDetails?.accountNumber || DEFAULT_COMPANY_BANK_DETAILS.accountNumber),
      ifsc: String(bankDetails?.ifsc || DEFAULT_COMPANY_BANK_DETAILS.ifsc).toUpperCase(),
    };
  }

  loadReports(): void {
    this.loading = true;
    this.reportService.getReports().subscribe({
      next: (response) => {
        this.loading = false;
        this.reports = response.success ? response.data : [];
      },
      error: () => {
        this.loading = false;
        this.toastr.error('Failed to load reports', 'Error');
      }
    });
  }

  openCreate(): void {
    this.mode = 'create';
    this.selectedReport = null;
  }

  openView(report: Report): void {
    this.mode = 'view';
    this.selectedReport = report;
  }

  openEdit(report: Report): void {
    this.mode = 'edit';
    this.selectedReport = report;
  }

  backToList(): void {
    this.mode = 'list';
    this.selectedReport = null;
  }

  onSave(payload: ReportPayload): void {
    const payloadWithCompanyBank: ReportPayload = {
      ...payload,
      bankDetails: this.companyBankDetails,
    };

    if (this.mode === 'edit' && this.selectedReport?._id) {
      this.reportService.updateReport(this.selectedReport._id, payloadWithCompanyBank).subscribe({
        next: (response) => {
          if (!response.success) {
            this.toastr.error(response.message || 'Failed to update report', 'Error');
            return;
          }
          this.toastr.success('Report updated successfully', 'Success');
          this.backToList();
          this.loadReports();
        },
        error: () => this.toastr.error('Failed to update report', 'Error')
      });
      return;
    }

    this.reportService.createReport(payloadWithCompanyBank).subscribe({
      next: (response) => {
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to create report', 'Error');
          return;
        }
        this.toastr.success('Report created successfully', 'Success');
        this.backToList();
        this.loadReports();
      },
      error: () => this.toastr.error('Failed to create report', 'Error')
    });
  }

  onDelete(report: Report): void {
    const ok = window.confirm(`Delete report ${report.invoiceNumber}?`);
    if (!ok) {
      return;
    }

    this.reportService.deleteReport(report._id).subscribe({
      next: (response) => {
        if (!response.success) {
          this.toastr.error(response.message || 'Failed to delete report', 'Error');
          return;
        }
        this.toastr.success('Report deleted', 'Success');
        this.loadReports();
      },
      error: () => this.toastr.error('Failed to delete report', 'Error')
    });
  }

  async onDownload(report: Report): Promise<void> {
    await this.ensureLogoDataUrl();
    const docDefinition = this.buildPdfDefinition(report);
    pdfMake.createPdf(docDefinition as any).download(`${report.invoiceNumber}.pdf`);
  }

  private buildPdfDefinition(report: Report): any {
    const logoContent = this.logoDataUrl
      ? {
          image: this.logoDataUrl,
          width: 72,
          alignment: 'center' as const,
          margin: [0, 0, 0, 0],
          fillColor: '#0d1c3e',
        }
      : {
          text: 'M.A.',
          alignment: 'center' as const,
          bold: true,
          color: '#ffffff',
          fontSize: 20,
          fillColor: '#0d1c3e',
          margin: [0, 24, 0, 24],
        };

    const itemRows = report.items.map((item, index) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const descCell = item.subDescription
        ? {
            stack: [
              { text: item.description || '-' },
              { text: item.subDescription, italics: true, color: '#475569', fontSize: 7, margin: [0, 2, 0, 0] },
            ]
          }
        : { text: item.description || '-' };

      return [
        { text: String(index + 1), alignment: 'center' },
        descCell,
        { text: item.hsn || '-', alignment: 'center' },
        { text: qty ? qty.toFixed(2) : '-', alignment: 'right' },
        { text: rate ? rate.toFixed(2) : '-', alignment: 'right' },
        { text: Number(item.amount || 0).toFixed(2), alignment: 'right' },
      ];
    });

    // Match dense invoice look by padding service table to fixed visible rows.
    const minVisibleRows = 10;
    while (itemRows.length < minVisibleRows) {
      itemRows.push([
        { text: ' ', alignment: 'center' },
        { text: ' ' },
        { text: ' ', alignment: 'center' },
        { text: ' ', alignment: 'right' },
        { text: ' ', alignment: 'right' },
        { text: ' ', alignment: 'right' },
      ]);
    }

    const dateText = new Date(report.date).toLocaleDateString('en-IN');
    const amountWords = this.numberToWords(report.total);

    return {
      pageSize: 'A4',
      pageMargins: [16, 14, 16, 14],
      defaultStyle: { fontSize: 8 },
      watermark: report.status === 'Paid'
        ? { text: 'PAID', color: '#16a34a', opacity: 0.07, bold: true, fontSize: 90, angle: -45 }
        : { text: 'MUKUNDHA ASSOCIATES', color: '#124a8b', opacity: 0.04, bold: true, fontSize: 50, angle: -45 },
      content: [
        { text: 'ORIGINAL FOR RECIPIENT', alignment: 'right', bold: true, fontSize: 7, margin: [0, 0, 0, 3] },
        {
          table: {
            widths: [72, '*', 188],
            body: [
              [
                logoContent,
                [
                  { text: this.company.name + ',', bold: true, fontSize: 10 },
                  { text: this.company.address, margin: [0, 1, 0, 0] },
                  { text: `GSTIN/UIN: ${this.company.gst}`, margin: [0, 1, 0, 0] },
                  { text: `State Name: ${this.company.state}`, margin: [0, 1, 0, 0] },
                  { text: `E-Mail: ${this.company.email}`, margin: [0, 1, 0, 0] },
                ],
                {
                  table: {
                    widths: [80, '*'],
                    body: [
                      [{ text: 'Tax Invoice', colSpan: 2, bold: true, alignment: 'center', fillColor: '#f1f3f5' }, {}],
                      [{ text: 'Invoice No.', bold: true }, report.invoiceNumber],
                      [{ text: 'Dated', bold: true }, dateText],
                      [{ text: 'Delivery Note', bold: true }, '-'],
                      [{ text: 'Mode/Terms', bold: true }, 'Credit'],
                      [{ text: 'Reference No.', bold: true }, '-'],
                      [{ text: 'Other Ref.', bold: true }, report.status],
                    ]
                  },
                  layout: {
                    hLineWidth: () => 0.8,
                    vLineWidth: () => 0.8,
                    hLineColor: () => '#111',
                    vLineColor: () => '#111',
                    paddingTop: () => 2,
                    paddingBottom: () => 2,
                    paddingLeft: () => 3,
                    paddingRight: () => 3,
                  }
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: (_r: any, _n: any, col: number) => col === 0 ? 0 : 3,
            paddingBottom: (_r: any, _n: any, col: number) => col === 0 ? 0 : 3,
            paddingLeft: (_r: any, _n: any, col: number) => col === 0 ? 0 : 4,
            paddingRight: (_r: any, _n: any, col: number) => col === 0 ? 0 : 4,
          }
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                [
                  { text: 'Buyer (Bill To)', bold: true, fillColor: '#f7f7f7' },
                  { text: report.client.name, margin: [0, 1, 0, 0] },
                  { text: report.client.address, margin: [0, 1, 0, 0] },
                  { text: `GSTIN/UIN: ${report.client.gst}`, margin: [0, 1, 0, 0] },
                  { text: `Place of Supply: ${report.placeOfSupply || '-'}`, margin: [0, 1, 0, 0] },
                ],
                [
                  { text: 'Consignee (Ship To)', bold: true, fillColor: '#f7f7f7' },
                  { text: report.client.name, margin: [0, 1, 0, 0] },
                  { text: report.client.address, margin: [0, 1, 0, 0] },
                  { text: `GSTIN/UIN: ${report.client.gst}`, margin: [0, 1, 0, 0] },
                  { text: `State Name: ${this.company.state}`, margin: [0, 1, 0, 0] },
                ]
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          }
        },
        {
          table: {
            headerRows: 1,
            widths: [18, '*', 52, 38, 50, 62],
            body: [
              [
                { text: 'Sl', bold: true, fillColor: '#f7f7f7', alignment: 'center' },
                { text: 'Description of Services', bold: true, fillColor: '#f7f7f7' },
                { text: 'HSN/SAC', bold: true, fillColor: '#f7f7f7', alignment: 'center' },
                { text: 'Qty', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
                { text: 'Rate', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
                { text: 'Amount', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
              ],
              ...itemRows,
              [
                { text: '', colSpan: 5 }, {}, {}, {}, {},
                { text: report.subtotal.toFixed(2), alignment: 'right', bold: true }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 3,
            paddingRight: () => 3,
          }
        },
        {
          table: {
            widths: ['*', 170],
            body: [
              [
                { text: '' },
                {
                  table: {
                    widths: [104, '*'],
                    body: [
                      [{ text: 'Taxable Value', bold: true }, { text: report.subtotal.toFixed(2), alignment: 'right' }],
                      [{ text: 'CGST @ 9.00%', bold: true }, { text: report.cgst.toFixed(2), alignment: 'right' }],
                      [{ text: 'SGST @ 9.00%', bold: true }, { text: report.sgst.toFixed(2), alignment: 'right' }],
                      [{ text: 'Total', bold: true, fillColor: '#f7f7f7' }, { text: report.total.toFixed(2), alignment: 'right', bold: true, fillColor: '#f7f7f7' }],
                    ]
                  },
                  layout: {
                    hLineWidth: () => 1,
                    vLineWidth: () => 1,
                    hLineColor: () => '#111',
                    vLineColor: () => '#111',
                    paddingTop: () => 2,
                    paddingBottom: () => 2,
                    paddingLeft: () => 3,
                    paddingRight: () => 3,
                  }
                }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
          }
        },
        {
          table: {
            widths: ['*'],
            body: [[{ text: `Amount Chargeable (in words): ${amountWords}`, bold: true }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          }
        },
        {
          table: {
            widths: [86, 58, 56, 54, '*'],
            body: [
              [
                { text: 'HSN/SAC', bold: true, fillColor: '#f7f7f7', alignment: 'center' },
                { text: 'Taxable Value', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
                { text: 'CGST Amount', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
                { text: 'SGST Amount', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
                { text: 'Total Tax Amount', bold: true, fillColor: '#f7f7f7', alignment: 'right' },
              ],
              [
                report.items[0]?.hsn || '-',
                { text: report.subtotal.toFixed(2), alignment: 'right' },
                { text: report.cgst.toFixed(2), alignment: 'right' },
                { text: report.sgst.toFixed(2), alignment: 'right' },
                { text: (report.cgst + report.sgst).toFixed(2), alignment: 'right' },
              ],
              [
                { text: 'Total', bold: true },
                { text: report.subtotal.toFixed(2), alignment: 'right', bold: true },
                { text: report.cgst.toFixed(2), alignment: 'right', bold: true },
                { text: report.sgst.toFixed(2), alignment: 'right', bold: true },
                { text: (report.cgst + report.sgst).toFixed(2), alignment: 'right', bold: true },
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 3,
            paddingRight: () => 3,
          }
        },
        {
          table: {
            widths: ['*'],
            body: [[{ text: `Tax Amount (in words): ${this.numberToWords(report.cgst + report.sgst)}`, bold: true }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          }
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                [
                  { text: 'Company Bank Details', bold: true, fillColor: '#f7f7f7' },
                  { text: `Bank Name: ${report.bankDetails.bankName}`, margin: [0, 1, 0, 0] },
                  { text: `A/c No.: ${report.bankDetails.accountNumber}`, margin: [0, 1, 0, 0] },
                  { text: `IFSC Code: ${report.bankDetails.ifsc}`, margin: [0, 1, 0, 0] },
                ],
                [
                  { text: 'Declaration', bold: true, fillColor: '#f7f7f7' },
                  { text: report.declaration, margin: [0, 1, 0, 0] },
                  { text: '\n\n\nfor ' + this.company.name, alignment: 'right', bold: true },
                  { text: '\nAuthorized Signatory', alignment: 'right' },
                ]
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          }
        },
        {
          table: {
            widths: ['*'],
            body: [[{ text: 'SUBJECT TO CHENNAI JURISDICTION | Terms: E.& O.E. | This is a computer generated invoice.', alignment: 'center', fontSize: 7 }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: () => 3,
            paddingBottom: () => 3,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          }
        },
      ]
    };
  }

  private async ensureLogoDataUrl(): Promise<string | null> {
    if (this.logoDataUrl) {
      return this.logoDataUrl;
    }

    if (!this.logoLoadPromise) {
      this.logoLoadPromise = this.loadLogoDataUrl();
    }

    return this.logoLoadPromise;
  }

  private async loadLogoDataUrl(): Promise<string | null> {
    try {
      const response = await fetch(this.logoPath);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      this.logoDataUrl = await this.blobToDataUrl(blob);
      return this.logoDataUrl;
    } catch {
      return null;
    } finally {
      this.logoLoadPromise = null;
    }
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private numberToWords(amount: number): string {
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const toWordsUnder1000 = (num: number): string => {
      let text = '';
      if (num >= 100) {
        text += `${units[Math.floor(num / 100)]} Hundred `;
        num %= 100;
      }
      if (num >= 20) {
        text += `${tens[Math.floor(num / 10)]} `;
        num %= 10;
      } else if (num >= 10) {
        text += `${teens[num - 10]} `;
        num = 0;
      }
      if (num > 0) {
        text += `${units[num]} `;
      }
      return text.trim();
    };

    const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const rounded = round2(amount);
    const rupees = Math.floor(rounded);
    const paise = Math.round((rounded - rupees) * 100);

    if (rupees === 0) {
      return `Rupees Zero${paise ? ` and ${toWordsUnder1000(paise)} Paise` : ''} Only`;
    }

    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const hundred = rupees % 1000;

    const parts: string[] = [];
    if (crore) parts.push(`${toWordsUnder1000(crore)} Crore`);
    if (lakh) parts.push(`${toWordsUnder1000(lakh)} Lakh`);
    if (thousand) parts.push(`${toWordsUnder1000(thousand)} Thousand`);
    if (hundred) parts.push(toWordsUnder1000(hundred));

    const paiseText = paise ? ` and ${toWordsUnder1000(paise)} Paise` : '';
    return `Rupees ${parts.join(' ')}${paiseText} Only`;
  }
}
