import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import { Report, ReportPayload, ReportService } from './report.service';
import { ReportListComponent } from './report-list/report-list.component';
import { ReportFormComponent } from './report-form/report-form.component';
import { AuthService, ProfileUpiPaymentDetails } from '../auth/auth.service';
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

const DEFAULT_UPI_PAYMENT_DETAILS: ProfileUpiPaymentDetails = {
  upiQrImage: '',
  upiId: '',
  upiMobileNumber: '',
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
  companyUpiPaymentDetails: ProfileUpiPaymentDetails = { ...DEFAULT_UPI_PAYMENT_DETAILS };
  private readonly logoPath = 'assets/invoice-logo-banner.png';
  private readonly logoCellWidthPt = 82;
  private readonly logoCellBackground = '#132348';
  private logoDataUrl: string | null = null;
  private paymentQrDataUrl: string | null = null;
  private logoLoadPromise: Promise<string | null> | null = null;
  private paymentQrLoadPromise: Promise<string | null> | null = null;

  readonly company = {
    name: 'MUKUNDHA ASSOCIATES',
    address: '3rd Floor, 73-27 TF7, Block C, Swamy Iyer New Street, Katteri Chettiar Thottam, Coimbatore - 641001',
    gst: '33CXJPS3712H1ZF',
    state: 'Tamil Nadu',
    code: '33',
    email: 'tpksathyan@gmail.com',
    phone: '',
  };

  constructor(
    private readonly reportService: ReportService,
    private readonly toastr: ToastrService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.syncCompanyPaymentDetailsFromSession();
    void this.ensureLogoDataUrl();
    void this.ensurePaymentQrDataUrl();
    this.loadReports();
  }

  private syncCompanyPaymentDetailsFromSession(): void {
    const user = this.authService.getUser();
    const bankDetails = user?.bankDetails;
    this.companyBankDetails = {
      bankName: String(bankDetails?.bankName || DEFAULT_COMPANY_BANK_DETAILS.bankName),
      accountNumber: String(bankDetails?.accountNumber || DEFAULT_COMPANY_BANK_DETAILS.accountNumber),
      ifsc: String(bankDetails?.ifsc || DEFAULT_COMPANY_BANK_DETAILS.ifsc).toUpperCase(),
    };

    const upi = user?.upiPaymentDetails || {};
    this.companyUpiPaymentDetails = {
      upiQrImage: String(upi.upiQrImage || '').trim(),
      upiId: String(upi.upiId || '').trim(),
      upiMobileNumber: String(upi.upiMobileNumber || '').replace(/\D/g, '').slice(0, 10),
    };
    this.paymentQrDataUrl = null;
    this.paymentQrLoadPromise = null;
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
    await Promise.all([this.ensureLogoDataUrl(), this.ensurePaymentQrDataUrl()]);
    const docDefinition = this.buildPdfDefinition(report);
    pdfMake.createPdf(docDefinition as any).download(`${report.invoiceNumber}.pdf`);
  }

  private buildPdfDefinition(report: Report): any {
    const taxableSubtotal = this.resolveTaxableSubtotal(report);
    const nonTaxableSubtotal = this.resolveNonTaxableSubtotal(report);
    const subtotal = this.round2(taxableSubtotal + nonTaxableSubtotal);
    const cgst = this.round2(taxableSubtotal * 0.09);
    const sgst = this.round2(taxableSubtotal * 0.09);
    const total = this.round2(taxableSubtotal + cgst + sgst + nonTaxableSubtotal);
    const taxableHsnSummary = this.getTaxableHsnSummary(report);
    const companyPhone = String(
      this.company.phone || (this.authService.getUser() as { ownerWhatsappNumber?: string } | null)?.ownerWhatsappNumber || '',
    ).trim();
    const dateText = new Date(report.date).toLocaleDateString('en-IN');
    // A4 content ≈ 563pt → ~14.5% / ~50.5% / ~35%
    // Square invoice logo banner (pre-centered on #132348) fills the logo cell.
    const headerLogoWidth = this.logoCellWidthPt;
    const headerInvoiceWidth = 196;
    const companyPhoneLabel = companyPhone || '-';
    const addressLines = this.splitCompanyAddress(this.company.address);

    const logoCell = this.logoDataUrl
      ? {
          // Cell fill matches banner so stretched row height never shows white under the logo.
          fillColor: this.logoCellBackground,
          image: this.logoDataUrl,
          width: headerLogoWidth,
          alignment: 'center' as const,
        }
      : {
          fillColor: this.logoCellBackground,
          alignment: 'center' as const,
          text: 'M.A.',
          bold: true,
          color: '#ffffff',
          fontSize: 13,
          margin: [0, 18, 0, 18],
        };

    const companyDetailsStack: any[] = [
      {
        text: this.company.name,
        bold: true,
        fontSize: 11,
        margin: [0, 0, 0, 2],
      },
      {
        text: addressLines[0] || this.company.address,
        fontSize: 7.5,
        lineHeight: 1.15,
        margin: [0, 0, 0, 0],
      },
      {
        text: addressLines[1] || '',
        fontSize: 7.5,
        lineHeight: 1.15,
        margin: [0, 0, 0, 2],
      },
      {
        text: `GSTIN : ${this.company.gst}`,
        fontSize: 7.5,
        lineHeight: 1.2,
        margin: [0, 0, 0, 1.5],
      },
      {
        text: `State : ${this.company.state}     Code : ${this.company.code}`,
        fontSize: 7.5,
        lineHeight: 1.2,
        margin: [0, 0, 0, 1.5],
      },
      {
        text: `Email : ${this.company.email}`,
        fontSize: 7.5,
        lineHeight: 1.2,
        margin: [0, 0, 0, 1.5],
      },
      {
        text: `Phone : ${companyPhoneLabel}`,
        fontSize: 7.5,
        lineHeight: 1.2,
        margin: [0, 0, 0, 0],
      },
    ];

    const invoiceDetailRows: any[][] = [
      [
        {
          text: 'Tax Invoice',
          colSpan: 2,
          bold: true,
          alignment: 'center',
          fontSize: 8.5,
          fillColor: '#eef2f7',
          margin: [0, 0, 0, 0],
        },
        {},
      ],
      [
        { text: 'Invoice No.', bold: true, fontSize: 7.5 },
        { text: report.invoiceNumber, fontSize: 7.5 },
      ],
      [
        { text: 'Invoice Date', bold: true, fontSize: 7.5 },
        { text: dateText, fontSize: 7.5 },
      ],
      [
        { text: 'Payment Terms', bold: true, fontSize: 7.5 },
        { text: 'Credit', fontSize: 7.5 },
      ],
      [
        { text: 'Status', bold: true, fontSize: 7.5 },
        { text: report.status, fontSize: 7.5 },
      ],
    ];

    const itemRows = report.items.map((item, index) => {
      const qty = Number(item.quantity || 0);
      const rate = Number(item.rate || 0);
      const hsn = String(item.hsn || '').trim();
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
        { text: hsn || 'Non-Taxable', alignment: 'center' },
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

    const amountWords = this.numberToWords(total);

    return {
      pageSize: 'A4',
      pageMargins: [16, 14, 16, 14],
      defaultStyle: { fontSize: 8 },
      watermark: report.status === 'Paid'
        ? { text: 'PAID', color: '#16a34a', opacity: 0.07, bold: true, fontSize: 90, angle: -45 }
        : { text: 'MUKUNDHA ASSOCIATES', color: '#124a8b', opacity: 0.04, bold: true, fontSize: 50, angle: -45 },
      content: [
        {
          text: 'ORIGINAL FOR RECIPIENT',
          alignment: 'right',
          bold: true,
          fontSize: 8,
          color: '#334155',
          margin: [0, 0, 0, 2],
        },
        {
          table: {
            widths: [headerLogoWidth, '*', headerInvoiceWidth],
            body: [
              [
                logoCell,
                {
                  stack: companyDetailsStack.filter((line) => String(line?.text || '').trim().length > 0),
                  margin: [18, 8, 6, 4],
                },
                {
                  margin: [2, 2, 2, 2],
                  table: {
                    widths: [66, '*'],
                    body: invoiceDetailRows,
                  },
                  layout: {
                    hLineWidth: () => 0.7,
                    vLineWidth: () => 0.7,
                    hLineColor: () => '#111',
                    vLineColor: () => '#111',
                    paddingTop: () => 1.5,
                    paddingBottom: () => 1.5,
                    paddingLeft: () => 4,
                    paddingRight: () => 4,
                  },
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => '#111',
            vLineColor: () => '#111',
            paddingTop: (_rowIndex: number, _node: any, columnIndex: number) => (columnIndex === 0 ? 0 : 2),
            paddingBottom: (_rowIndex: number, _node: any, columnIndex: number) => (columnIndex === 0 ? 0 : 2),
            paddingLeft: () => 0,
            paddingRight: () => 0,
          },
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
                  { text: `State Name: ${this.company.state}, Code: ${this.company.code}`, margin: [0, 1, 0, 0] },
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
                { text: subtotal.toFixed(2), alignment: 'right', bold: true }
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
                      [{ text: 'Taxable Value', bold: true }, { text: taxableSubtotal.toFixed(2), alignment: 'right' }],
                      [{ text: 'Non-Taxable Value', bold: true }, { text: nonTaxableSubtotal.toFixed(2), alignment: 'right' }],
                      [{ text: 'CGST @ 9.00%', bold: true }, { text: cgst.toFixed(2), alignment: 'right' }],
                      [{ text: 'SGST @ 9.00%', bold: true }, { text: sgst.toFixed(2), alignment: 'right' }],
                      [{ text: 'Total', bold: true, fillColor: '#f7f7f7' }, { text: total.toFixed(2), alignment: 'right', bold: true, fillColor: '#f7f7f7' }],
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
                taxableHsnSummary,
                { text: taxableSubtotal.toFixed(2), alignment: 'right' },
                { text: cgst.toFixed(2), alignment: 'right' },
                { text: sgst.toFixed(2), alignment: 'right' },
                { text: (cgst + sgst).toFixed(2), alignment: 'right' },
              ],
              [
                { text: 'Total', bold: true },
                { text: taxableSubtotal.toFixed(2), alignment: 'right', bold: true },
                { text: cgst.toFixed(2), alignment: 'right', bold: true },
                { text: sgst.toFixed(2), alignment: 'right', bold: true },
                { text: (cgst + sgst).toFixed(2), alignment: 'right', bold: true },
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
            body: [[{ text: `Tax Amount (in words): ${this.numberToWords(cgst + sgst)}`, bold: true }]],
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
                {
                  columns: this.buildBankAndUpiColumns(report),
                  columnGap: 10,
                },
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

  private buildBankAndUpiColumns(report: Report): any[] {
    const upiId = String(this.companyUpiPaymentDetails.upiId || '').trim();
    const upiMobile = String(this.companyUpiPaymentDetails.upiMobileNumber || '').trim();
    const bankStack: any[] = [
      { text: 'Company Bank Details', bold: true, fillColor: '#f7f7f7', margin: [0, 0, 0, 2] },
      { text: `Bank Name: ${report.bankDetails.bankName}`, margin: [0, 1, 0, 0] },
      { text: `A/c No.: ${report.bankDetails.accountNumber}`, margin: [0, 1, 0, 0] },
      { text: `IFSC Code: ${report.bankDetails.ifsc}`, margin: [0, 1, 0, 0] },
    ];

    // When QR is missing, still show UPI text under bank details if configured.
    if (!this.paymentQrDataUrl) {
      if (upiId) {
        bankStack.push({ text: `UPI ID: ${upiId}`, margin: [0, 3, 0, 0], bold: true });
      }
      if (upiMobile) {
        bankStack.push({ text: `GPay / PhonePe: ${upiMobile}`, margin: [0, 3, 0, 0], bold: true });
      }
    }

    const columns: any[] = [
      {
        width: '*',
        stack: bankStack,
      },
    ];

    if (this.paymentQrDataUrl) {
      const qrStack: any[] = [
        {
          image: this.paymentQrDataUrl,
          fit: [110, 110],
          alignment: 'center',
          margin: [0, 0, 0, 4],
        },
        { text: 'Scan & Pay', alignment: 'center', bold: true, fontSize: 8, margin: [0, 0, 0, 3] },
      ];
      if (upiId) {
        qrStack.push({ text: `UPI ID:\n${upiId}`, alignment: 'center', fontSize: 7, margin: [0, 0, 0, 2] });
      }
      if (upiMobile) {
        qrStack.push({ text: `GPay / PhonePe:\n${upiMobile}`, alignment: 'center', fontSize: 7 });
      }

      columns.push({
        width: 130,
        stack: qrStack,
        alignment: 'center',
      });
    }

    return columns;
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

  private async ensurePaymentQrDataUrl(): Promise<string | null> {
    const qrUrl = String(this.companyUpiPaymentDetails.upiQrImage || '').trim();
    if (!qrUrl) {
      this.paymentQrDataUrl = null;
      this.paymentQrLoadPromise = null;
      return null;
    }

    if (this.paymentQrDataUrl) {
      return this.paymentQrDataUrl;
    }

    if (!this.paymentQrLoadPromise) {
      this.paymentQrLoadPromise = this.loadPaymentQrDataUrl(qrUrl);
    }

    return this.paymentQrLoadPromise;
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

  private async loadPaymentQrDataUrl(qrUrl: string): Promise<string | null> {
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();
      this.paymentQrDataUrl = await this.blobToDataUrl(blob);
      return this.paymentQrDataUrl;
    } catch {
      return null;
    } finally {
      this.paymentQrLoadPromise = null;
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

  private splitCompanyAddress(address: string): [string, string] {
    const normalized = String(address || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return ['', ''];
    }

    const preferredBreak = normalized.indexOf(', Katteri');
    if (preferredBreak > 0) {
      return [
        normalized.slice(0, preferredBreak + 1).trim(),
        normalized.slice(preferredBreak + 1).trim(),
      ];
    }

    const mid = Math.floor(normalized.length / 2);
    const splitAt = normalized.lastIndexOf(',', mid);
    if (splitAt > 20) {
      return [
        normalized.slice(0, splitAt + 1).trim(),
        normalized.slice(splitAt + 1).trim(),
      ];
    }

    return [normalized, ''];
  }

  private resolveTaxableSubtotal(report: Report): number {
    if (typeof report.taxableSubtotal === 'number') {
      return this.round2(report.taxableSubtotal);
    }

    return this.sumReportItemsByTaxability(report, true);
  }

  private resolveNonTaxableSubtotal(report: Report): number {
    if (typeof report.nonTaxableSubtotal === 'number') {
      return this.round2(report.nonTaxableSubtotal);
    }

    return this.sumReportItemsByTaxability(report, false);
  }

  private sumReportItemsByTaxability(report: Report, taxable: boolean): number {
    const sum = report.items.reduce((total, item) => {
      const hsn = String(item.hsn || '').trim();
      const amount = Number(item.amount) || 0;
      return Boolean(hsn) === taxable ? total + amount : total;
    }, 0);

    return this.round2(sum);
  }

  private getTaxableHsnSummary(report: Report): string {
    const values = report.items
      .map((item) => String(item.hsn || '').trim())
      .filter(Boolean);
    return Array.from(new Set(values)).join(', ') || '-';
  }

  private round2(value: number): number {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
