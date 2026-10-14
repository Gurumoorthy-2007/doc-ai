// ============================================================
// DocuSentinel AI — Deterministic Vendor Dispute Letter Generator
// Zero LLM reliance for arithmetic, citations, or legal boilerplate.
// ============================================================

import type { Finding } from '../types';

export interface DisputeLetterOptions {
  finding: Finding;
  vendorName?: string;
  invoiceNumber?: string;
  poNumber?: string;
  contractNumber?: string;
  organizationName?: string;
  senderName?: string;
  senderTitle?: string;
  actionRequiredDays?: number;
}

export interface DisputeLetter {
  referenceNumber: string;
  subject: string;
  bodyText: string;
  summary: {
    vendorName: string;
    invoiceNumber: string;
    poNumber: string;
    discrepancyTitle: string;
    ruleId: string;
    billedAmount: string;
    authorizedAmount: string;
    varianceAmount: string;
    currency: string;
  };
}

export function generateVendorDisputeLetter(options: DisputeLetterOptions): DisputeLetter {
  const {
    finding,
    vendorName = 'Valued Supplier',
    invoiceNumber = finding.source_value || 'N/A',
    poNumber = finding.compared_value || 'N/A',
    contractNumber = 'Governing Master Agreement',
    organizationName = 'Finance & Accounts Payable Operations',
    senderName = 'Commercial Finance Audit Team',
    senderTitle = 'Accounts Payable Discrepancy Desk',
    actionRequiredDays = 5,
  } = options;

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const refNum = `DISP-${new Date().getFullYear()}-${finding.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
  const curr = finding.currency || 'USD';
  const billedVal = finding.source_value || 'Unspecified';
  const authVal = finding.compared_value || 'Unspecified';
  const varianceFormatted =
    typeof finding.variance === 'number'
      ? `${curr} ${Math.abs(finding.variance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : finding.financial_impact
      ? `${curr} ${Math.abs(finding.financial_impact).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'Calculated upon review';

  const subject = `FORMAL NOTICE OF INVOICE DISCREPANCY — Ref: ${refNum} / Invoice: ${invoiceNumber}`;

  const evidenceCitations: string[] = [];
  if (finding.source_page) {
    evidenceCitations.push(`Invoice Passage (Page ${finding.source_page}): "${finding.source_text || billedVal}"`);
  }
  if (finding.compared_page) {
    evidenceCitations.push(`Purchase Order / Contract Passage (Page ${finding.compared_page}): "${finding.compared_text || authVal}"`);
  }

  const citationBlock =
    evidenceCitations.length > 0
      ? `\nEVIDENCE & AUDIT TRAIL:\n${evidenceCitations.map((c) => `  • ${c}`).join('\n')}\n`
      : '';

  const bodyText = `
DATE: ${dateStr}
TO: Accounts Receivable / Commercial Billing Department
    ${vendorName}
FROM: ${organizationName}
      ${senderName} (${senderTitle})

SUBJECT: ${subject}
REFERENCE: ${refNum}

Dear Accounts Receivable Team,

During our automated and human-in-the-loop pre-payment three-way audit, an itemized discrepancy was flagged on Invoice ${invoiceNumber} against our authorized Purchase Order ${poNumber} and contract terms.

Pursuant to standard commercial audit controls, payment on the disputed portion of this invoice has been placed on hold pending formal resolution.

DISCREPANCY SUMMARY:
--------------------------------------------------------------------------------
Discrepancy Category : ${finding.title}
Audit Rule Enforced  : ${finding.rule_id || 'COMMERCIAL_VARIANCE'}
Severity Level       : ${finding.severity.toUpperCase()}
Billed / Claimed     : ${billedVal}
Authorized / Cap     : ${authVal}
Variance Amount      : ${varianceFormatted}
Financial Direction  : ${finding.variance && finding.variance > 0 ? 'Overbilled beyond commitment' : 'Variance requiring clarification'}
--------------------------------------------------------------------------------

AUDIT FINDING DETAILS:
${finding.description}
${citationBlock}
REQUIRED REMEDIATION:
To facilitate prompt reconciliation and release of legitimate undisputed funds, please execute one of the following remediation options within ${actionRequiredDays} business days:

  Option A (Credit Note):
    Issue a formal Credit Note in the amount of ${varianceFormatted} referencing Invoice ${invoiceNumber}.

  Option B (Corrected Invoice Reissue):
    Cancel Invoice ${invoiceNumber} and issue an amended invoice reflecting the authorized unit price / quantity specified in Purchase Order ${poNumber}.

  Option C (Substantiation):
    Provide written documentation and authorized change-order approval justifying the rate / quantity variance.

Please remit your response directly to accounts-payable@organization.com referencing case reference ${refNum}.

Sincerely,

${senderName}
${senderTitle}
${organizationName}
DocuSentinel AI Automated Reconciliation Engine
`;

  return {
    referenceNumber: refNum,
    subject,
    bodyText: bodyText.trim(),
    summary: {
      vendorName,
      invoiceNumber,
      poNumber,
      discrepancyTitle: finding.title,
      ruleId: finding.rule_id || 'RULE_VARIANCE',
      billedAmount: billedVal,
      authorizedAmount: authVal,
      varianceAmount: varianceFormatted,
      currency: curr,
    },
  };
}
