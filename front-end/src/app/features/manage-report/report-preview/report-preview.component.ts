import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Report, ReportItem } from '../report.service';

@Component({
  selector: 'app-report-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-preview.component.html',
  styleUrls: ['./report-preview.component.scss']
})
export class ReportPreviewComponent {
  @Input() report: Partial<Report> | null = null;

  readonly company = {
    name: 'MUKUNDHA ASSOCIATES',
    address: '3rd Floor, 73-27 TF7, Block C, Swamy Iyer New Street, Katteri Chettiar Thottam, Coimbatore - 641001',
    gst: '33CXJPS3712H1ZF',
    state: 'Tamil Nadu, Code: 33',
    email: 'tpksathyan@gmail.com'
  };

  get subtotal(): number {
    if (typeof this.report?.subtotal === 'number') {
      return this.report.subtotal;
    }
    return (this.report?.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  get taxableSubtotal(): number {
    if (typeof this.report?.taxableSubtotal === 'number') {
      return this.report.taxableSubtotal;
    }
    return this.sumItemsByTaxability(true);
  }

  get nonTaxableSubtotal(): number {
    if (typeof this.report?.nonTaxableSubtotal === 'number') {
      return this.report.nonTaxableSubtotal;
    }
    return this.sumItemsByTaxability(false);
  }

  get cgst(): number {
    return this.round2(this.taxableSubtotal * 0.09);
  }

  get sgst(): number {
    return this.round2(this.taxableSubtotal * 0.09);
  }

  get total(): number {
    return this.round2(this.taxableSubtotal + this.cgst + this.sgst + this.nonTaxableSubtotal);
  }

  get amountInWords(): string {
    return this.numberToWords(this.total);
  }

  itemHsnLabel(item: ReportItem): string {
    const hsn = String(item.hsn || '').trim();
    return hsn || 'Non-Taxable';
  }

  private sumItemsByTaxability(taxable: boolean): number {
    const sum = (this.report?.items || []).reduce((total, item) => {
      const hsn = String(item.hsn || '').trim();
      const amount = Number(item.amount) || 0;
      return Boolean(hsn) === taxable ? total + amount : total;
    }, 0);

    return this.round2(sum);
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

    const rounded = this.round2(amount);
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
