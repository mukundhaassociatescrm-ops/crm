/**
 * Maintainable suggestion list for Manage Report description fields.
 * Keep placeholders like [Month/Period], [Period], [Year] for users to edit after selection.
 */
export const REPORT_DESCRIPTION_SUGGESTIONS: readonly string[] = [
  'Computation preparation and Income tax return filing for AY 2026–27.',
  'Self-Assessment Tax deposited for AY 2026–27.',
  'Preparation of GST Data and periodic monthly GST returns [Month/Period].',
  'GST Tax amount paid to the government portal for [Period].',
  'Reimbursement of RCM GST paid on inward supplies for [Period].',
  'Closure compliance and filing of Final GST Return (GSTR-10).',
  'Year-end data reconciliation and GSTR-9 annual filing for FY [Year].',
  'Annual GST reconciliation, audit statement, and GSTR-9/9C filing for FY [Year].',
  'Drafting and processing application to restore cancelled GSTIN.',
  'Drafting legal grounds and filing appeal before GST Appellate Authority.',
  'Reimbursement of official fees and filing expenses for GST work.',
  'Books audit, Form 3CD preparation, and Tax Audit filing u/s 44AB.',
  'Preparation of CMA financial statements and ratios for bank loan approval.',
  'Preparation of provisional statements and future financial projections.',
  'Detailed financial project report (DPR) for bank credit assessment.',
  'Consulting, accounting, and general tax advisory services for [Period].',
];

export const filterReportDescriptionSuggestions = (
  query: string,
  suggestions: readonly string[] = REPORT_DESCRIPTION_SUGGESTIONS,
): string[] => {
  const term = String(query || '').trim().toLowerCase();
  if (!term) {
    return [...suggestions];
  }

  return suggestions.filter((item) => item.toLowerCase().includes(term));
};
