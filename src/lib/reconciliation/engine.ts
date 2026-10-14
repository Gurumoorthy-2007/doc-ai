// ============================================================
// DocuSentinel AI — Reconciliation Engine
// Deterministic comparison rules — no LLM for arithmetic
// ============================================================

import type {
  ExtractedField,
  LineItem,
  Finding,
  FindingType,
  FindingSeverity,
  ReconciliationStatus,
  BoundingBox,
  OrganizationConfig,
  ExistingInvoiceSummary,
} from '@/lib/types';
import {
  validateGstin,
  validateGstRateSlab,
  validateGstTaxType,
  hasHsnSacCode,
} from './indiaGst';

export interface DocumentData {
  id: string;
  category: string;
  fields: Record<string, ExtractedField>;
  lineItems: LineItem[];
}

export interface ReconciliationOptions {
  goodsReceipt?: DocumentData | null;
  existingInvoices?: ExistingInvoiceSummary[];
  config?: OrganizationConfig;
  requireFourWayMatching?: boolean;
  groupId?: string;
  reconGroupId?: string;
}

export interface ReconciliationResult {
  status: ReconciliationStatus;
  findings: Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'>[];
  contractValue: number | null;
  poValue: number | null;
  invoiceValue: number | null;
  variance: number | null;
  variancePercentage: number | null;
  currency: string | null;
  vendorName: string | null;
  contractStatus?: 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE' | 'WITHIN_CONTRACT_LIMIT' | 'EXCEEDS_CONTRACT';
  poToInvoiceStatus?: 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE';
  cumulativeBilled?: number | null;
  remainingPoBalance?: number | null;
  remainingContractBalance?: number | null;
  goodsReceiptMatched?: boolean;
}

export type ComparisonOutcome = 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE';

// ------------------------------------------------------------
// Deterministic Helper Functions (Exported for unit testing)
// ------------------------------------------------------------

export function getFieldValue(fields: Record<string, ExtractedField>, name: string): string | null {
  return fields[name]?.field_value ?? null;
}

export function getNumericValue(fields: Record<string, ExtractedField>, name: string): number | null {
  const val = getFieldValue(fields, name);
  if (!val) return null;
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function normalizeString(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Strips common corporate entity types for reliable supplier matching.
 */
export function normalizeSupplierName(name: string | null | undefined): string {
  if (!name) return '';
  let cleaned = name.trim().toLowerCase();
  // Remove punctuation
  cleaned = cleaned.replace(/[^a-z0-9\s]/g, ' ');
  // Remove common corporate suffixes
  cleaned = cleaned.replace(
    /\b(private\s+limited|pvt\s+ltd|pvt|ltd|limited|inc|incorporated|llc|corp|corporation|co|company|enterprises|solutions|technologies|services)\b/g,
    ''
  );
  // Collapse whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Compare two supplier names reliably without naive substring matching.
 */
export function compareSupplierNames(
  a: string | null | undefined,
  b: string | null | undefined
): ComparisonOutcome {
  if (!a || !b) return 'NOT_COMPARABLE';
  const normA = normalizeSupplierName(a);
  const normB = normalizeSupplierName(b);

  if (!normA || !normB) return 'NOT_COMPARABLE';
  if (normA === normB) return 'MATCH';

  // Token-based Jaccard similarity
  const tokensA = new Set(normA.split(' ').filter(Boolean));
  const tokensB = new Set(normB.split(' ').filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 'NOT_COMPARABLE';

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  const jaccard = intersection.size / union.size;

  // If token overlap is >= 0.65 and share key brand tokens
  if (jaccard >= 0.65) {
    return 'MATCH';
  }

  // Check if one is an exact prefix or suffix set of words
  const listA = normA.split(' ').filter(Boolean);
  const listB = normB.split(' ').filter(Boolean);
  const shorter = listA.length <= listB.length ? listA : listB;
  const longer = listA.length > listB.length ? listA : listB;

  const allShorterInLonger = shorter.every((t) => longer.includes(t));
  if (allShorterInLonger && shorter.length >= 2) {
    return 'MATCH';
  }

  return 'MISMATCH';
}

/**
 * Generalized string comparison
 */
export function compareStrings(
  a: string | null | undefined,
  b: string | null | undefined
): ComparisonOutcome {
  if (!a || !b) return 'NOT_COMPARABLE';
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na || !nb) return 'NOT_COMPARABLE';
  if (na === nb) return 'MATCH';
  return 'MISMATCH';
}

/**
 * Deterministically parses payment terms into normalized day offsets.
 * E.g. "Immediate" -> 0, "Due Upon Receipt" -> 0, "Net 15" -> 15, "Net 30 Days" -> 30, "Net 60" -> 60.
 */
export function parsePaymentTermsDays(terms: string | null | undefined): number | null {
  if (!terms) return null;
  const clean = terms.trim().toLowerCase();
  if (/\b(?:immediate|upon\s+receipt|due\s+(?:on|upon)\s+receipt|cod|cash\s+on\s+delivery)\b/i.test(clean)) {
    return 0;
  }
  const match = clean.match(/\b(?:net\s*)?(\d+)(?:\s*days?)?\b/i);
  if (match) {
    const days = parseInt(match[1], 10);
    return isNaN(days) ? null : days;
  }
  return null;
}

/**
 * Safe numeric comparison with configurable tolerance for rounding (default 0.01%).
 */
export function compareNumeric(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerancePercent: number = 0.0001, // 0.01%
  absoluteTolerance?: number
): ComparisonOutcome {
  if (a === null || a === undefined || b === null || b === undefined) return 'NOT_COMPARABLE';
  if (a === 0 && b === 0) return 'MATCH';
  const diff = Math.abs(a - b);
  const absTol = absoluteTolerance !== undefined ? absoluteTolerance : 0.05;
  // Accept sub-cent or configured absolute difference
  if (diff <= absTol) return 'MATCH';
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (diff <= base * tolerancePercent) return 'MATCH';
  return 'MISMATCH';
}

export function calculateVariance(
  invoiceTotal: number | null | undefined,
  poTotal: number | null | undefined
): number | null {
  if (invoiceTotal === null || invoiceTotal === undefined || poTotal === null || poTotal === undefined) {
    return null;
  }
  return invoiceTotal - poTotal;
}

export interface DuplicateCandidate {
  id: string;
  number?: string | null;
  supplier?: string | null;
  total?: number | null;
  date?: string | null;
}

export function checkDuplicateInvoice(
  target: string | DuplicateCandidate | null | undefined,
  existingInvoices: Array<DuplicateCandidate | { id: string; number: string }>,
  currentDocId?: string
): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> | null {
  if (!target) return null;

  const targetDocId = typeof target === 'string' ? (currentDocId || '') : (target.id || currentDocId || '');
  const targetNumber = typeof target === 'string' ? target : (target.number || null);
  const targetSupplier = typeof target === 'object' && target !== null ? target.supplier : null;
  const targetTotal = typeof target === 'object' && target !== null ? target.total : null;
  const targetDate = typeof target === 'object' && target !== null ? target.date : null;

  const normalizedTargetNum = normalizeString(targetNumber);

  // 1. Direct Invoice Number Match
  if (normalizedTargetNum) {
    const dup = existingInvoices.find((inv) => {
      const invNum = 'number' in inv ? inv.number : null;
      return normalizeString(invNum) === normalizedTargetNum && inv.id !== targetDocId;
    });

    if (dup) {
      const dupNum = 'number' in dup ? dup.number : targetNumber;
      return makeFinding({
        rule_id: 'RULE_DUP_INVOICE_NUMBER',
        finding_type: 'duplicate_invoice',
        severity: 'critical',
        title: 'Duplicate invoice detected',
        description: `Invoice number "${targetNumber}" matches previously processed invoice in document ${dup.id}.`,
        reason: `Duplicate invoice detection rule triggered: identical invoice number "${targetNumber}" found across separate documents.`,
        source_document_id: targetDocId,
        compared_document_id: dup.id,
        source_value: targetNumber,
        compared_value: dupNum ?? null,
        variance: 0,
        calculation_method: 'Exact identifier matching: Normalized(Invoice Number A) == Normalized(Invoice Number B)',
        source_field: 'invoice_number',
        source_page: 1,
        source_text: `Invoice #${targetNumber}`,
        compared_field: 'invoice_number',
        compared_page: 1,
        compared_text: `Invoice #${dupNum}`,
      });
    }
  }

  // 2. Multi-parameter heuristic collision (Same supplier, same total amount, same invoice date)
  if (targetSupplier && targetTotal !== null && targetTotal !== undefined && targetDate) {
    const candidateDup = existingInvoices.find((inv) => {
      if (inv.id === targetDocId) return false;
      const c = inv as DuplicateCandidate;
      if (!c.supplier || c.total === null || c.total === undefined || !c.date) return false;
      const sameSupplier = compareSupplierNames(c.supplier, targetSupplier) === 'MATCH';
      const sameTotal = compareNumeric(c.total, targetTotal) === 'MATCH';
      const sameDate = normalizeString(c.date) === normalizeString(targetDate);
      return sameSupplier && sameTotal && sameDate;
    }) as DuplicateCandidate | undefined;

    if (candidateDup) {
      return makeFinding({
        rule_id: 'RULE_DUP_INVOICE_HEURISTIC',
        finding_type: 'duplicate_invoice',
        severity: 'high',
        title: 'Potential duplicate invoice (Amount, Supplier & Date collision)',
        description: `Invoice from supplier "${targetSupplier}" for amount ${targetTotal} on ${targetDate} matches existing document ${candidateDup.id}.`,
        reason: 'Deterministic collision check: Invoices from identical supplier with identical amounts and dates indicate probable duplicate billing.',
        source_document_id: targetDocId,
        compared_document_id: candidateDup.id,
        source_value: `${targetSupplier} | ${targetTotal} | ${targetDate}`,
        compared_value: `${candidateDup.supplier} | ${candidateDup.total} | ${candidateDup.date}`,
        variance: 0,
        calculation_method: 'Multi-parameter composite collision: (Supplier Match && Amount Match && Date Match)',
        source_field: 'total',
        compared_field: 'total',
      });
    }
  }

  return null;
}

function makeFinding(params: {
  rule_id?: string | null;
  finding_type: FindingType;
  severity: FindingSeverity;
  title: string;
  description: string;
  reason: string;
  source_document_id: string | null;
  compared_document_id: string | null;
  source_value: string | null;
  compared_value: string | null;
  variance?: number | null;
  financial_impact?: number | null;
  currency?: string | null;
  calculation_method?: string | null;
  source_field?: string | null;
  source_page?: number | null;
  source_text?: string | null;
  source_verified?: boolean;
  source_bounding_box?: BoundingBox | null;
  compared_field?: string | null;
  compared_page?: number | null;
  compared_text?: string | null;
  compared_verified?: boolean;
  compared_bounding_box?: BoundingBox | null;
  reconciliation_group_id?: string | null;
}): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  return {
    rule_id: params.rule_id ?? null,
    reconciliation_group_id: params.reconciliation_group_id ?? null,
    finding_type: params.finding_type,
    severity: params.severity,
    status: 'open',
    title: params.title,
    description: params.description,
    reason: params.reason,
    source_document_id: params.source_document_id,
    compared_document_id: params.compared_document_id,
    source_value: params.source_value,
    compared_value: params.compared_value,
    variance: params.variance ?? (params.financial_impact !== undefined ? params.financial_impact : null),
    financial_impact: params.financial_impact ?? null,
    currency: params.currency ?? null,
    calculation_method: params.calculation_method ?? 'Deterministic comparison rule',
    source_field: params.source_field ?? null,
    source_page: params.source_page ?? null,
    source_text: params.source_text ?? null,
    source_verified: params.source_verified ?? true,
    source_bounding_box: params.source_bounding_box ?? null,
    compared_field: params.compared_field ?? null,
    compared_page: params.compared_page ?? null,
    compared_text: params.compared_text ?? null,
    compared_verified: params.compared_verified ?? true,
    compared_bounding_box: params.compared_bounding_box ?? null,
    reviewed_by: null,
    reviewed_at: null,
    is_reviewed: false,
    review_decision: null,
    review_comments: null,
    decision_history: [],
    source_document: null,
    compared_document: null,
    reconciliation_group: null,
    reviewer: null,
  };
}

// ------------------------------------------------------------
// Core 3-Way Reconciliation Engine
// ------------------------------------------------------------

export function reconcileDocuments(
  contract: DocumentData | null,
  purchaseOrder: DocumentData | null,
  invoice: DocumentData | null,
  reconGroupIdOrGoodsReceiptOrOptions?: string | DocumentData | null | ReconciliationOptions,
  goodsReceiptOrOptions?: DocumentData | null | ReconciliationOptions,
  maybeOptions?: ReconciliationOptions
): ReconciliationResult {
  const findings: Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [];
  let overallStatus: ReconciliationStatus = 'matched';

  // Normalize parameters
  let reconGroupId: string | undefined = undefined;
  let goodsReceipt: DocumentData | null = null;
  let options: ReconciliationOptions | undefined = maybeOptions;

  if (typeof reconGroupIdOrGoodsReceiptOrOptions === 'string') {
    reconGroupId = reconGroupIdOrGoodsReceiptOrOptions;
  } else if (reconGroupIdOrGoodsReceiptOrOptions && typeof reconGroupIdOrGoodsReceiptOrOptions === 'object') {
    if ('category' in reconGroupIdOrGoodsReceiptOrOptions) {
      goodsReceipt = reconGroupIdOrGoodsReceiptOrOptions as DocumentData;
    } else {
      options = reconGroupIdOrGoodsReceiptOrOptions as ReconciliationOptions;
    }
  }

  if (goodsReceiptOrOptions) {
    if ('category' in goodsReceiptOrOptions) {
      goodsReceipt = goodsReceiptOrOptions as DocumentData;
    } else {
      options = goodsReceiptOrOptions as ReconciliationOptions;
    }
  }

  if (options?.goodsReceipt) {
    goodsReceipt = options.goodsReceipt;
  }
  reconGroupId = reconGroupId || options?.reconGroupId || options?.groupId;

  const config = options?.config;
  const existingInvoices = options?.existingInvoices || [];
  const requireFourWayMatching = options?.requireFourWayMatching ?? config?.require_four_way_matching ?? false;

  const priceTolerancePct = (config?.price_tolerance_percentage ?? 0.05) / 100;
  const amountToleranceAbs = config?.amount_tolerance_absolute ?? 1.00;
  const qtyTolerancePct = (config?.quantity_tolerance_percentage ?? 0.0) / 100;

  // Extract key values
  const contractValue = contract ? getNumericValue(contract.fields, 'contract_value') : null;
  const poTotal = purchaseOrder ? getNumericValue(purchaseOrder.fields, 'total') : null;
  const invoiceTotal = invoice ? getNumericValue(invoice.fields, 'total') : null;

  const contractCurrency = contract ? getFieldValue(contract.fields, 'currency') : null;
  const poCurrency = purchaseOrder ? getFieldValue(purchaseOrder.fields, 'currency') : null;
  const invoiceCurrency = invoice ? getFieldValue(invoice.fields, 'currency') : null;

  const contractSupplier = contract ? getFieldValue(contract.fields, 'supplier_name') : null;
  const poSupplier = purchaseOrder ? getFieldValue(purchaseOrder.fields, 'supplier_name') : null;
  const invoiceSupplier = invoice ? getFieldValue(invoice.fields, 'supplier_name') : null;

  const currency = invoiceCurrency || poCurrency || contractCurrency || 'INR';
  const vendorName = invoiceSupplier || poSupplier || contractSupplier || null;

  // 1. Missing Documents
  if (invoice && !purchaseOrder) {
    overallStatus = 'missing_po';
    findings.push(
      makeFinding({
        rule_id: 'RULE_MISSING_PO',
        finding_type: 'missing_field',
        severity: 'high',
        title: 'Missing Purchase Order',
        description: 'Invoice has no associated purchase order for reconciliation.',
        reason: 'No purchase order document exists to verify authorization for this invoice.',
        source_document_id: invoice.id,
        compared_document_id: null,
        source_value: getFieldValue(invoice.fields, 'po_reference'),
        compared_value: null,
        financial_impact: invoiceTotal,
        variance: invoiceTotal,
        currency,
        calculation_method: 'Unmatched document check: invoice lacks linked purchase order authorization',
        source_field: 'po_reference',
        reconciliation_group_id: reconGroupId,
      })
    );
  }

  if (purchaseOrder && !invoice) {
    overallStatus = 'missing_invoice';
  }

  // 2. Currency Mismatches
  const presentCurrencies = [
    { curr: contractCurrency, docId: contract?.id, type: 'contract' },
    { curr: poCurrency, docId: purchaseOrder?.id, type: 'purchase_order' },
    { curr: invoiceCurrency, docId: invoice?.id, type: 'invoice' },
  ].filter((c) => Boolean(c.curr));

  const uniqueCurrencies = new Set(presentCurrencies.map((c) => normalizeString(c.curr)));
  if (uniqueCurrencies.size > 1) {
    overallStatus = 'discrepancy';
    const currencyList = presentCurrencies.map((c) => `${c.type}: ${c.curr}`).join(', ');
    findings.push(
      makeFinding({
        rule_id: 'RULE_CURRENCY_MISMATCH',
        finding_type: 'currency_mismatch',
        severity: 'critical',
        title: 'Currency mismatch across documents',
        description: `Incompatible currencies detected (${currencyList}). Financial amounts cannot be compared without currency conversion.`,
        reason: 'Reconciliation rule prohibits comparing monetary values across differing currencies.',
        source_document_id: invoice?.id ?? purchaseOrder?.id ?? null,
        compared_document_id: contract?.id ?? purchaseOrder?.id ?? null,
        source_value: invoiceCurrency || poCurrency || null,
        compared_value: contractCurrency || poCurrency || null,
        currency: null,
        calculation_method: 'Multi-document currency code validation: Set(extracted currencies).size > 1',
        reconciliation_group_id: reconGroupId,
      })
    );

    // Stop cross-currency amount comparisons
    return {
      status: overallStatus,
      findings,
      contractValue,
      poValue: poTotal,
      invoiceValue: invoiceTotal,
      variance: null,
      variancePercentage: null,
      currency,
      vendorName,
    };
  }

  // 3. Supplier Identity Matching
  const supplierPairs: Array<{
    nameA: string | null;
    nameB: string | null;
    idA: string | null;
    idB: string | null;
    typeA: string;
    typeB: string;
  }> = [];

  if (contract && purchaseOrder) {
    supplierPairs.push({
      nameA: contractSupplier,
      nameB: poSupplier,
      idA: contract.id,
      idB: purchaseOrder.id,
      typeA: 'contract',
      typeB: 'purchase_order',
    });
  }
  if (purchaseOrder && invoice) {
    supplierPairs.push({
      nameA: poSupplier,
      nameB: invoiceSupplier,
      idA: purchaseOrder.id,
      idB: invoice.id,
      typeA: 'purchase_order',
      typeB: 'invoice',
    });
  }
  if (contract && invoice) {
    supplierPairs.push({
      nameA: contractSupplier,
      nameB: invoiceSupplier,
      idA: contract.id,
      idB: invoice.id,
      typeA: 'contract',
      typeB: 'invoice',
    });
  }

  for (const pair of supplierPairs) {
    const outcome = compareSupplierNames(pair.nameA, pair.nameB);
    if (outcome === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          rule_id: 'RULE_SUPPLIER_MISMATCH',
          finding_type: 'supplier_mismatch',
          severity: 'high',
          title: `Supplier name mismatch (${pair.typeA} vs ${pair.typeB})`,
          description: `Supplier "${pair.nameA}" in ${pair.typeA} differs from "${pair.nameB}" in ${pair.typeB}.`,
          reason: 'Vendor identification check failed: entity names are distinct organizations.',
          source_document_id: pair.idB,
          compared_document_id: pair.idA,
          source_value: pair.nameB,
          compared_value: pair.nameA,
          source_field: 'supplier_name',
          compared_field: 'supplier_name',
          calculation_method: 'Token Jaccard similarity and legal suffix normalization',
          source_text: pair.idB && invoice?.id === pair.idB ? invoice.fields['supplier_name']?.source_text : null,
          compared_text: pair.idA && purchaseOrder?.id === pair.idA ? purchaseOrder.fields['supplier_name']?.source_text : null,
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 4. Financial Reconciliation: PO vs Invoice
  let variance: number | null = null;
  let variancePercentage: number | null = null;

  if (invoiceTotal !== null && poTotal !== null) {
    variance = invoiceTotal - poTotal;
    if (poTotal > 0) {
      variancePercentage = (variance / poTotal) * 100;
    }

    const cmp = compareNumeric(invoiceTotal, poTotal, 0.0001, amountToleranceAbs);
    if (cmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      if (invoiceTotal > poTotal) {
        // Positive variance: Invoice exceeds PO
        findings.push(
          makeFinding({
            rule_id: 'RULE_INVOICE_EXCEEDS_PO',
            finding_type: 'exceeds_po_amount',
            severity: 'critical',
            title: 'Invoice exceeds PO amount',
            description: `Invoice total (${currency} ${invoiceTotal.toLocaleString('en-IN')}) exceeds approved purchase order total (${currency} ${poTotal.toLocaleString('en-IN')}) by ${currency} ${variance.toLocaleString('en-IN')} (${variancePercentage?.toFixed(2)}%).`,
            reason: 'Rule: Invoiced amount exceeds authorized purchase order commitment.',
            source_document_id: invoice!.id,
            compared_document_id: purchaseOrder!.id,
            source_value: invoiceTotal.toString(),
            compared_value: poTotal.toString(),
            financial_impact: variance,
            variance,
            currency,
            calculation_method: 'Variance = Invoice Stated Total - Approved PO Total',
            source_field: 'total',
            compared_field: 'total',
            source_page: invoice?.fields['total']?.source_page ?? 1,
            source_text: invoice?.fields['total']?.source_text ?? null,
            source_verified: invoice?.fields['total']?.verified ?? true,
            source_bounding_box: invoice?.fields['total']?.bounding_box ?? null,
            compared_page: purchaseOrder?.fields['total']?.source_page ?? 1,
            compared_text: purchaseOrder?.fields['total']?.source_text ?? null,
            compared_verified: purchaseOrder?.fields['total']?.verified ?? true,
            compared_bounding_box: purchaseOrder?.fields['total']?.bounding_box ?? null,
            reconciliation_group_id: reconGroupId,
          })
        );
      } else {
        // Negative variance: Invoiced less than PO (underbilling)
        findings.push(
          makeFinding({
            rule_id: 'RULE_INVOICE_UNDER_PO',
            finding_type: 'amount_mismatch',
            severity: 'medium',
            title: 'Invoice amount less than PO',
            description: `Invoice total (${currency} ${invoiceTotal.toLocaleString('en-IN')}) is less than PO total (${currency} ${poTotal.toLocaleString('en-IN')}).`,
            reason: 'Partial billing or underbill detected between invoice and purchase order.',
            source_document_id: invoice!.id,
            compared_document_id: purchaseOrder!.id,
            source_value: invoiceTotal.toString(),
            compared_value: poTotal.toString(),
            financial_impact: Math.abs(variance),
            variance,
            currency,
            calculation_method: 'Variance = Invoice Stated Total - Approved PO Total',
            source_field: 'total',
            compared_field: 'total',
            source_page: invoice?.fields['total']?.source_page ?? 1,
            source_text: invoice?.fields['total']?.source_text ?? null,
            source_verified: invoice?.fields['total']?.verified ?? true,
            source_bounding_box: invoice?.fields['total']?.bounding_box ?? null,
            compared_page: purchaseOrder?.fields['total']?.source_page ?? 1,
            compared_text: purchaseOrder?.fields['total']?.source_text ?? null,
            compared_verified: purchaseOrder?.fields['total']?.verified ?? true,
            compared_bounding_box: purchaseOrder?.fields['total']?.bounding_box ?? null,
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }
  }

  // 5. Financial Reconciliation: Contract vs PO and Invoice
  if (contractValue !== null && poTotal !== null) {
    if (poTotal > contractValue) {
      overallStatus = 'discrepancy';
      const contractVariance = poTotal - contractValue;
      findings.push(
        makeFinding({
          rule_id: 'RULE_PO_EXCEEDS_CONTRACT',
          finding_type: 'exceeds_contract_value',
          severity: 'critical',
          title: 'PO exceeds contract commitment',
          description: `PO total (${currency} ${poTotal.toLocaleString('en-IN')}) exceeds contract maximum (${currency} ${contractValue.toLocaleString('en-IN')}) by ${currency} ${contractVariance.toLocaleString('en-IN')}.`,
          reason: 'Rule: Purchase order authorization exceeds Master Service Agreement / Contract cap.',
          source_document_id: purchaseOrder!.id,
          compared_document_id: contract!.id,
          source_value: poTotal.toString(),
          compared_value: contractValue.toString(),
          financial_impact: contractVariance,
          variance: contractVariance,
          currency,
          calculation_method: 'Variance = PO Stated Total - Master Contract Value Cap',
          source_field: 'total',
          compared_field: 'contract_value',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  if (contractValue !== null && invoiceTotal !== null) {
    if (invoiceTotal > contractValue) {
      overallStatus = 'discrepancy';
      const overContract = invoiceTotal - contractValue;
      findings.push(
        makeFinding({
          rule_id: 'RULE_INVOICE_EXCEEDS_CONTRACT',
          finding_type: 'exceeds_contract_value',
          severity: 'critical',
          title: 'Invoice exceeds contract maximum',
          description: `Invoice total (${currency} ${invoiceTotal.toLocaleString('en-IN')}) exceeds master contract cap (${currency} ${contractValue.toLocaleString('en-IN')}) by ${currency} ${overContract.toLocaleString('en-IN')}.`,
          reason: 'Rule: Cumulative or single invoice billing exceeds contract ceiling.',
          source_document_id: invoice!.id,
          compared_document_id: contract!.id,
          source_value: invoiceTotal.toString(),
          compared_value: contractValue.toString(),
          financial_impact: overContract,
          variance: overContract,
          currency,
          calculation_method: 'Variance = Invoice Stated Total - Master Contract Value Cap',
          source_field: 'total',
          compared_field: 'contract_value',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 5b. Cumulative Partial Invoicing vs PO and Contract Caps
  let cumulativeBilled: number | null = null;
  let remainingPoBalance: number | null = null;
  let remainingContractBalance: number | null = null;

  if (existingInvoices.length > 0 || invoiceTotal !== null) {
    const priorInvoicesForPo = existingInvoices.filter((inv) => {
      if (purchaseOrder && inv.po_reference) {
        const poNum = getFieldValue(purchaseOrder.fields, 'po_number');
        if (poNum && normalizeString(inv.po_reference) !== normalizeString(poNum)) {
          return false;
        }
      }
      if (invoice) {
        if (inv.id && inv.id === invoice.id) return false;
        const currentInvNum = getFieldValue(invoice.fields, 'invoice_number');
        if (currentInvNum && inv.invoice_number && normalizeString(inv.invoice_number) === normalizeString(currentInvNum)) {
          return false;
        }
      }
      return true;
    });

    const priorBilled = priorInvoicesForPo.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const currentInvAmt = invoiceTotal || 0;
    cumulativeBilled = priorBilled + currentInvAmt;
    if (poTotal !== null) {
      remainingPoBalance = poTotal - cumulativeBilled;
    }
    if (contractValue !== null) {
      remainingContractBalance = contractValue - cumulativeBilled;
    }

    // Cumulative PO Cap Check
    if (poTotal !== null && priorInvoicesForPo.length > 0 && cumulativeBilled > poTotal + amountToleranceAbs) {
      overallStatus = 'discrepancy';
      const poExcess = cumulativeBilled - poTotal;
      findings.push(
        makeFinding({
          rule_id: 'RULE_PO_CUMULATIVE_BILLED_EXCEEDED',
          finding_type: 'exceeds_po_amount',
          severity: 'critical',
          title: 'Cumulative partial invoices exceed PO authorization',
          description: `Cumulative billed amount (${currency} ${cumulativeBilled.toLocaleString('en-IN')}) across ${priorInvoicesForPo.length + 1} invoices exceeds authorized PO commitment (${currency} ${poTotal.toLocaleString('en-IN')}) by ${currency} ${poExcess.toLocaleString('en-IN')}. Prior invoices billed: ${currency} ${priorBilled.toLocaleString('en-IN')}.`,
          reason: 'Cumulative billing validation failed: sum of current and prior invoices exceeds authorized purchase order total.',
          source_document_id: invoice?.id ?? null,
          compared_document_id: purchaseOrder?.id ?? null,
          source_value: cumulativeBilled.toString(),
          compared_value: poTotal.toString(),
          financial_impact: poExcess,
          variance: poExcess,
          currency,
          calculation_method: 'Cumulative Invoices Sum - Approved PO Total',
          source_field: 'total',
          compared_field: 'total',
          reconciliation_group_id: reconGroupId,
        })
      );
    }

    // Cumulative Contract Cap Check
    if (contractValue !== null && priorInvoicesForPo.length > 0 && cumulativeBilled > contractValue + amountToleranceAbs) {
      overallStatus = 'discrepancy';
      const contractExcess = cumulativeBilled - contractValue;
      findings.push(
        makeFinding({
          rule_id: 'RULE_CONTRACT_CUMULATIVE_BILLED_EXCEEDED',
          finding_type: 'exceeds_contract_value',
          severity: 'critical',
          title: 'Cumulative billing exceeds contract value ceiling',
          description: `Cumulative billed amount (${currency} ${cumulativeBilled.toLocaleString('en-IN')}) exceeds master contract ceiling (${currency} ${contractValue.toLocaleString('en-IN')}) by ${currency} ${contractExcess.toLocaleString('en-IN')}. Prior invoices billed: ${currency} ${priorBilled.toLocaleString('en-IN')}.`,
          reason: 'Master contract commitment exceeded across cumulative billing cycle.',
          source_document_id: invoice?.id ?? null,
          compared_document_id: contract?.id ?? null,
          source_value: cumulativeBilled.toString(),
          compared_value: contractValue.toString(),
          financial_impact: contractExcess,
          variance: contractExcess,
          currency,
          calculation_method: 'Cumulative Invoices Sum - Master Contract Value Cap',
          source_field: 'total',
          compared_field: 'contract_value',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 6. Subtotal + Tax = Total Arithmetic Check (Invoice)
  if (invoice) {
    const subtotal = getNumericValue(invoice.fields, 'subtotal');
    const tax = getNumericValue(invoice.fields, 'tax');
    const total = getNumericValue(invoice.fields, 'total');

    if (subtotal !== null && tax !== null && total !== null) {
      const computedTotal = subtotal + tax;
      const cmp = compareNumeric(computedTotal, total);
      if (cmp === 'MISMATCH') {
        overallStatus = 'discrepancy';
        const mathDiff = Math.abs(total - computedTotal);
        findings.push(
          makeFinding({
            rule_id: 'RULE_ARITHMETIC_TAX_SUBTOTAL',
            finding_type: 'tax_discrepancy',
            severity: 'high',
            title: 'Invoice arithmetic variance (Subtotal + Tax ≠ Total)',
            description: `Document states subtotal ${currency} ${subtotal.toLocaleString('en-IN')} + tax ${currency} ${tax.toLocaleString('en-IN')} = expected ${currency} ${computedTotal.toLocaleString('en-IN')}, but stated total is ${currency} ${total.toLocaleString('en-IN')} (${currency} ${mathDiff.toFixed(2)} difference).`,
            reason: 'Invoice arithmetic validation failed: sum of subtotal and tax does not equal total amount.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: total.toString(),
            compared_value: computedTotal.toFixed(2),
            financial_impact: mathDiff,
            variance: total - computedTotal,
            currency,
            calculation_method: 'Variance = Stated Total - (Subtotal + Tax)',
            source_field: 'total',
            compared_field: 'subtotal+tax',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }
  }

  // 7. Line Item Discrepancies (PO vs Invoice)
  if (purchaseOrder && invoice && purchaseOrder.lineItems.length > 0 && invoice.lineItems.length > 0) {
    const maxItems = Math.max(purchaseOrder.lineItems.length, invoice.lineItems.length);
    for (let i = 0; i < maxItems; i++) {
      const poItem = purchaseOrder.lineItems[i];
      const invItem = invoice.lineItems[i];

      if (!poItem && invItem) {
        findings.push(
          makeFinding({
            rule_id: 'RULE_LINE_ITEM_UNAPPROVED',
            finding_type: 'quantity_discrepancy',
            severity: 'medium',
            title: `Unapproved line item #${i + 1}`,
            description: `Invoice line item "${invItem.description}" was not present in the purchase order.`,
            reason: 'Line item was billed without matching PO line authorization.',
            source_document_id: invoice.id,
            compared_document_id: purchaseOrder.id,
            source_value: invItem.description ?? `Item ${i + 1}`,
            compared_value: null,
            financial_impact: invItem.amount,
            variance: invItem.amount,
            currency,
            calculation_method: 'Line item billed without matching authorized PO item',
            reconciliation_group_id: reconGroupId,
          })
        );
        overallStatus = 'discrepancy';
        continue;
      }

      if (poItem && invItem) {
        // Quantity check
        if (poItem.quantity !== null && invItem.quantity !== null) {
          const qCmp = compareNumeric(poItem.quantity, invItem.quantity, qtyTolerancePct);
          if (qCmp === 'MISMATCH') {
            const qtyVariance = invItem.quantity - poItem.quantity;
            const finImpact = invItem.unit_price ? Math.abs(qtyVariance) * invItem.unit_price : null;
            findings.push(
              makeFinding({
                rule_id: 'RULE_LINE_ITEM_QUANTITY',
                finding_type: 'quantity_discrepancy',
                severity: 'medium',
                title: `Quantity discrepancy on line item #${i + 1}`,
                description: `PO quantity was ${poItem.quantity}, but invoice billed for ${invItem.quantity} units of "${poItem.description || invItem.description}".`,
                reason: 'Billed quantity does not match approved purchase order quantity.',
                source_document_id: invoice.id,
                compared_document_id: purchaseOrder.id,
                source_value: invItem.quantity.toString(),
                compared_value: poItem.quantity.toString(),
                financial_impact: finImpact,
                variance: qtyVariance,
                currency,
                calculation_method: 'Variance = Invoice Quantity - PO Quantity; Impact = |Variance| * Unit Price',
                source_field: `line_item_${i + 1}_quantity`,
                compared_field: `line_item_${i + 1}_quantity`,
                reconciliation_group_id: reconGroupId,
              })
            );
            overallStatus = 'discrepancy';
          }
        }

        // Unit price check
        if (poItem.unit_price !== null && invItem.unit_price !== null) {
          const pCmp = compareNumeric(poItem.unit_price, invItem.unit_price, priceTolerancePct);
          if (pCmp === 'MISMATCH') {
            const rateVariance = invItem.unit_price - poItem.unit_price;
            const priceVariance = invItem.quantity
              ? Math.abs(rateVariance) * invItem.quantity
              : Math.abs(rateVariance);

            findings.push(
              makeFinding({
                rule_id: 'RULE_LINE_ITEM_PRICE',
                finding_type: 'unit_price_discrepancy',
                severity: 'medium',
                title: `Unit price discrepancy on line item #${i + 1}`,
                description: `PO rate was ${currency} ${poItem.unit_price}, but invoice billed rate of ${currency} ${invItem.unit_price} for "${poItem.description || invItem.description}".`,
                reason: 'Invoiced unit rate deviates from agreed purchase order rate.',
                source_document_id: invoice.id,
                compared_document_id: purchaseOrder.id,
                source_value: invItem.unit_price.toString(),
                compared_value: poItem.unit_price.toString(),
                financial_impact: priceVariance,
                variance: rateVariance,
                currency,
                calculation_method: 'Rate Variance = Invoice Unit Price - PO Unit Price; Impact = |Rate Variance| * Quantity',
                source_field: `line_item_${i + 1}_unit_price`,
                compared_field: `line_item_${i + 1}_unit_price`,
                reconciliation_group_id: reconGroupId,
              })
            );
            overallStatus = 'discrepancy';
          }
        }
      }
    }
  }

  // 7b. Four-Way Matching with Goods Receipt Note (GRN)
  let goodsReceiptMatched = false;
  if (requireFourWayMatching && invoice && !goodsReceipt) {
    overallStatus = 'discrepancy';
    findings.push(
      makeFinding({
        rule_id: 'RULE_GRN_MISSING',
        finding_type: 'missing_field',
        severity: 'high',
        title: 'Missing Goods Receipt Note (4-Way Matching Required)',
        description: 'Organization policy mandates four-way matching for physical goods invoices, but no verified Goods Receipt Note (GRN) was provided.',
        reason: 'Four-way reconciliation requirement failed: invoice lacks receiving verification.',
        source_document_id: invoice.id,
        compared_document_id: null,
        source_value: invoiceTotal?.toString() ?? null,
        compared_value: null,
        financial_impact: invoiceTotal ?? 0,
        variance: invoiceTotal ?? 0,
        currency,
        calculation_method: 'Mandatory 4-way matching policy verification',
        source_field: 'total',
        reconciliation_group_id: reconGroupId,
      })
    );
  }

  if (goodsReceipt && invoice) {
    goodsReceiptMatched = true;
    const grnSupplier = getFieldValue(goodsReceipt.fields, 'supplier_name');
    if (grnSupplier && invoiceSupplier) {
      const outcome = compareSupplierNames(grnSupplier, invoiceSupplier);
      if (outcome === 'MISMATCH') {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_SUPPLIER_MISMATCH',
            finding_type: 'supplier_mismatch',
            severity: 'high',
            title: 'Supplier name mismatch (GRN vs Invoice)',
            description: `Goods receipt supplier "${grnSupplier}" does not match invoice supplier "${invoiceSupplier}".`,
            reason: 'Vendor identification check failed: entity on goods receipt note differs from invoice vendor.',
            source_document_id: invoice.id,
            compared_document_id: goodsReceipt.id,
            source_value: invoiceSupplier,
            compared_value: grnSupplier,
            source_field: 'supplier_name',
            compared_field: 'supplier_name',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    // Compare GRN line items against Invoice line items
    if (invoice.lineItems.length > 0 && goodsReceipt.lineItems.length > 0) {
      for (const invItem of invoice.lineItems) {
        if (!invItem.description || invItem.quantity === null) continue;
        
        // Find matching GRN item by description
        const grnItem = goodsReceipt.lineItems.find((gi) => {
          if (!gi.description) return false;
          const normInv = normalizeString(invItem.description);
          const normGrn = normalizeString(gi.description);
          if (normInv === normGrn) return true;
          const tokensA = new Set(normInv.split(/[^a-z0-9]/).filter(Boolean));
          const tokensB = new Set(normGrn.split(/[^a-z0-9]/).filter(Boolean));
          if (tokensA.size === 0 || tokensB.size === 0) return false;
          const inter = [...tokensA].filter((t) => tokensB.has(t)).length;
          return inter / Math.max(tokensA.size, tokensB.size) >= 0.5;
        });

        if (grnItem && grnItem.quantity !== null) {
          const acceptedQty = (grnItem as { accepted_quantity?: number | null }).accepted_quantity !== undefined && (grnItem as { accepted_quantity?: number | null }).accepted_quantity !== null
            ? Number((grnItem as { accepted_quantity?: number | null }).accepted_quantity)
            : grnItem.quantity;
          const rejectedQty = (grnItem as { rejected_quantity?: number | null }).rejected_quantity !== undefined && (grnItem as { rejected_quantity?: number | null }).rejected_quantity !== null
            ? Number((grnItem as { rejected_quantity?: number | null }).rejected_quantity)
            : 0;

          // RULE_GRN_QUANTITY_MISMATCH: Invoiced quantity exceeds accepted quantity on GRN
          if (invItem.quantity > acceptedQty + (acceptedQty * qtyTolerancePct)) {
            overallStatus = 'discrepancy';
            const qtyDiff = invItem.quantity - acceptedQty;
            const unitPrice = invItem.unit_price ?? grnItem.unit_price ?? 0;
            const financialDiff = qtyDiff * unitPrice;
            findings.push(
              makeFinding({
                rule_id: 'RULE_GRN_QUANTITY_MISMATCH',
                finding_type: 'quantity_discrepancy',
                severity: 'critical',
                title: `Invoiced quantity exceeds verified goods receipt (${invItem.description})`,
                description: `Invoice bills for ${invItem.quantity} units of "${invItem.description}", but receiving warehouse accepted only ${acceptedQty} units on GRN (${qtyDiff} unit variance).`,
                reason: 'Goods receipt 4-way matching failure: billed quantity exceeds physically verified and accepted quantity.',
                source_document_id: invoice.id,
                compared_document_id: goodsReceipt.id,
                source_value: invItem.quantity.toString(),
                compared_value: acceptedQty.toString(),
                variance: qtyDiff,
                financial_impact: financialDiff,
                currency,
                calculation_method: 'Quantity Variance = Invoice Billed Qty - GRN Accepted Qty',
                source_field: 'quantity',
                compared_field: 'quantity',
                source_page: invItem.source_page ?? 1,
                reconciliation_group_id: reconGroupId,
              })
            );
          }

          // RULE_GRN_DAMAGE_REJECTED: Invoice bills for damaged/rejected items
          if (rejectedQty > 0 && invItem.quantity > acceptedQty) {
            overallStatus = 'discrepancy';
            const unitPrice = invItem.unit_price ?? grnItem.unit_price ?? 0;
            const impact = rejectedQty * unitPrice;
            findings.push(
              makeFinding({
                rule_id: 'RULE_GRN_DAMAGE_REJECTED',
                finding_type: 'data_validation',
                severity: 'critical',
                title: `Invoice billed for damaged/rejected goods on GRN (${invItem.description})`,
                description: `Warehouse marked ${rejectedQty} units as damaged or rejected on GRN for "${invItem.description}", but invoice billed for ${invItem.quantity} units without credit adjustment.`,
                reason: 'Damage/rejection rule: billed amounts include damaged or unaccepted materials reported on GRN.',
                source_document_id: invoice.id,
                compared_document_id: goodsReceipt.id,
                source_value: invItem.quantity.toString(),
                compared_value: `Rejected: ${rejectedQty}`,
                financial_impact: impact,
                variance: rejectedQty,
                currency,
                calculation_method: 'Rejected Units * Unit Price',
                source_field: 'quantity',
                compared_field: 'rejected_quantity',
                source_page: invItem.source_page ?? 1,
                reconciliation_group_id: reconGroupId,
              })
            );
          }
        }
      }
    }
  }

  // 8. Missing Required Mandatory Fields
  const mandatoryRules = [
    {
      doc: invoice,
      type: 'invoice',
      fields: ['invoice_number', 'supplier_name', 'total', 'invoice_date'],
    },
    {
      doc: purchaseOrder,
      type: 'purchase_order',
      fields: ['po_number', 'supplier_name', 'total'],
    },
    {
      doc: contract,
      type: 'contract',
      fields: ['contract_number', 'supplier_name', 'contract_value'],
    },
  ];

  for (const rule of mandatoryRules) {
    if (!rule.doc) continue;
    for (const field of rule.fields) {
      const val = getFieldValue(rule.doc.fields, field);
      if (!val || val.trim() === '') {
        findings.push(
          makeFinding({
            rule_id: 'RULE_MANDATORY_FIELD_MISSING',
            finding_type: 'missing_field',
            severity: 'medium',
            title: `Missing ${field.replace(/_/g, ' ')}`,
            description: `Mandatory field "${field.replace(/_/g, ' ')}" could not be extracted from ${rule.type}.`,
            reason: `Forensic requirement check: ${field} is mandatory for complete reconciliation.`,
            source_document_id: rule.doc.id,
            compared_document_id: null,
            source_value: null,
            compared_value: null,
            calculation_method: 'Schema mandatory field presence validation',
            source_field: field,
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }
  }

  // 9. PO Reference Verification (Invoice -> PO)
  if (purchaseOrder && invoice) {
    const poNumber = getFieldValue(purchaseOrder.fields, 'po_number');
    const invoicePoRef = getFieldValue(invoice.fields, 'po_reference');

    if (poNumber && invoicePoRef) {
      const cmpRef = compareStrings(poNumber, invoicePoRef);
      if (cmpRef === 'MISMATCH') {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_PO_REF_MISMATCH',
            finding_type: 'missing_field',
            severity: 'high',
            title: 'PO reference mismatch on invoice',
            description: `Invoice explicitly references "${invoicePoRef}", but the paired purchase order is "${poNumber}".`,
            reason: 'Invoice was issued with a mismatching purchase order identifier.',
            source_document_id: invoice.id,
            compared_document_id: purchaseOrder.id,
            source_value: invoicePoRef,
            compared_value: poNumber,
            calculation_method: 'Normalized string match: Invoice PO Reference vs PO Number',
            source_field: 'po_reference',
            compared_field: 'po_number',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    } else if (!invoicePoRef) {
      findings.push(
        makeFinding({
          rule_id: 'RULE_PO_REF_MISSING',
          finding_type: 'missing_field',
          severity: 'medium',
          title: 'Missing PO reference on invoice',
          description: `Invoice does not state a PO reference number for verification against ${poNumber || 'the purchase order'}.`,
          reason: 'Forensic integrity rule: Billed invoices must state the authorizing PO reference.',
          source_document_id: invoice.id,
          compared_document_id: purchaseOrder.id,
          source_value: null,
          compared_value: poNumber,
          calculation_method: 'Presence check: Invoice po_reference is non-empty',
          source_field: 'po_reference',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 10. Date Ordering & Chronological Sanity Checks
  if (invoice) {
    const invDateStr = getFieldValue(invoice.fields, 'invoice_date');
    const dueDateStr = getFieldValue(invoice.fields, 'due_date');

    if (invDateStr && dueDateStr) {
      const invDate = new Date(invDateStr);
      const dueDate = new Date(dueDateStr);
      if (!isNaN(invDate.getTime()) && !isNaN(dueDate.getTime()) && dueDate < invDate) {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_DUE_DATE_CHRONOLOGY',
            finding_type: 'missing_field',
            severity: 'high',
            title: 'Due date precedes invoice date',
            description: `Invoice due date (${dueDateStr}) occurs before the issue date (${invDateStr}).`,
            reason: 'Chronological inconsistency: Payment due date cannot precede invoice creation date.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: dueDateStr,
            compared_value: invDateStr,
            calculation_method: 'Date comparison: Due Date < Issue Date',
            source_field: 'due_date',
            compared_field: 'invoice_date',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    if (purchaseOrder && invDateStr) {
      const poDateStr = getFieldValue(purchaseOrder.fields, 'order_date');
      if (poDateStr) {
        const invDate = new Date(invDateStr);
        const poDate = new Date(poDateStr);
        if (!isNaN(invDate.getTime()) && !isNaN(poDate.getTime()) && invDate < poDate) {
          overallStatus = 'discrepancy';
          findings.push(
            makeFinding({
              rule_id: 'RULE_INVOICE_PREDATES_PO',
              finding_type: 'missing_field',
              severity: 'high',
              title: 'Invoice predates purchase order',
              description: `Invoice date (${invDateStr}) predates purchase order date (${poDateStr}).`,
              reason: 'Audit control violation: Invoices cannot legitimately be issued before the authorizing purchase order exists.',
              source_document_id: invoice.id,
              compared_document_id: purchaseOrder.id,
              source_value: invDateStr,
              compared_value: poDateStr,
              calculation_method: 'Date comparison: Invoice Date < PO Order Date',
              source_field: 'invoice_date',
              compared_field: 'order_date',
              reconciliation_group_id: reconGroupId,
            })
          );
        }
      }
    }
  }

  // 11. Contract Reference Verification (PO & Invoice -> Contract)
  if (contract) {
    const contractNumber = getFieldValue(contract.fields, 'contract_number');
    if (contractNumber) {
      // Check PO contract reference
      if (purchaseOrder) {
        const poContractRef = getFieldValue(purchaseOrder.fields, 'contract_reference');
        if (poContractRef) {
          if (compareStrings(poContractRef, contractNumber) === 'MISMATCH') {
            overallStatus = 'discrepancy';
            findings.push(
              makeFinding({
                rule_id: 'RULE_CONTRACT_REF_MISMATCH',
                finding_type: 'missing_field',
                severity: 'high',
                title: 'Contract reference mismatch on purchase order',
                description: `Purchase order references contract "${poContractRef}", which does not match active agreement "${contractNumber}".`,
                reason: 'Document link validation: Purchase order references an unauthorized or distinct agreement.',
                source_document_id: purchaseOrder.id,
                compared_document_id: contract.id,
                source_value: poContractRef,
                compared_value: contractNumber,
                source_field: 'contract_reference',
                compared_field: 'contract_number',
                reconciliation_group_id: reconGroupId,
              })
            );
          }
        } else {
          findings.push(
            makeFinding({
              rule_id: 'RULE_CONTRACT_REF_MISSING',
              finding_type: 'missing_field',
              severity: 'medium',
              title: 'Missing contract reference on purchase order',
              description: `Purchase order does not reference master agreement "${contractNumber}".`,
              reason: 'Audit governance: Commitments under master agreement must explicitly cite contract number.',
              source_document_id: purchaseOrder.id,
              compared_document_id: contract.id,
              source_value: null,
              compared_value: contractNumber,
              source_field: 'contract_reference',
              compared_field: 'contract_number',
              reconciliation_group_id: reconGroupId,
            })
          );
        }
      }

      // Check Invoice contract reference
      if (invoice) {
        const invContractRef = getFieldValue(invoice.fields, 'contract_reference');
        if (invContractRef && compareStrings(invContractRef, contractNumber) === 'MISMATCH') {
          overallStatus = 'discrepancy';
          findings.push(
            makeFinding({
              rule_id: 'RULE_CONTRACT_REF_MISMATCH',
              finding_type: 'missing_field',
              severity: 'high',
              title: 'Contract reference mismatch on invoice',
              description: `Invoice references contract "${invContractRef}", differing from active agreement "${contractNumber}".`,
              reason: 'Audit control violation: Invoiced billing cites mismatched master agreement.',
              source_document_id: invoice.id,
              compared_document_id: contract.id,
              source_value: invContractRef,
              compared_value: contractNumber,
              source_field: 'contract_reference',
              compared_field: 'contract_number',
              reconciliation_group_id: reconGroupId,
            })
          );
        }
      }
    }
  }

  // 12. Conflicting Payment Terms
  const contractPaymentTerms = contract ? getFieldValue(contract.fields, 'payment_terms') : null;
  const poPaymentTerms = purchaseOrder ? getFieldValue(purchaseOrder.fields, 'payment_terms') : null;
  const invoicePaymentTerms = invoice ? getFieldValue(invoice.fields, 'payment_terms') : null;

  if (contractPaymentTerms && invoicePaymentTerms) {
    const contractDays = parsePaymentTermsDays(contractPaymentTerms);
    const invoiceDays = parsePaymentTermsDays(invoicePaymentTerms);

    if (contractDays !== null && invoiceDays !== null) {
      if (invoiceDays < contractDays) {
        overallStatus = 'discrepancy';
        const daysDiff = contractDays - invoiceDays;
        const annualRate = config?.annual_cost_of_capital_rate ?? 0.12;
        const costOfCapital = (invoiceTotal || 0) * (daysDiff / 365) * annualRate;

        findings.push(
          makeFinding({
            rule_id: 'RULE_PAYMENT_TERMS_MISMATCH',
            finding_type: 'missing_field',
            severity: 'high',
            title: 'Payment terms conflict (Contract vs Invoice)',
            description: `Contract stipulates payment terms "${contractPaymentTerms}", but invoice specifies "${invoicePaymentTerms}".`,
            reason: 'Terms divergence: Invoiced credit/payment terms deviate from negotiated contract obligations.',
            source_document_id: invoice!.id,
            compared_document_id: contract!.id,
            source_value: invoicePaymentTerms,
            compared_value: contractPaymentTerms,
            source_field: 'payment_terms',
            compared_field: 'payment_terms',
            reconciliation_group_id: reconGroupId,
          })
        );

        findings.push(
          makeFinding({
            rule_id: 'RULE_CONFLICTING_PAYMENT_TERMS',
            finding_type: 'payment_term_mismatch',
            severity: 'high',
            title: 'Conflicting payment terms: Invoice demands earlier payment than contract',
            description: `Invoice specifies payment terms "${invoicePaymentTerms}" (${invoiceDays} days), but master contract specifies "${contractPaymentTerms}" (${contractDays} days). Demanding payment ${daysDiff} days early accelerates cash outflow, costing an estimated ${currency} ${costOfCapital.toFixed(2)} in capital financing at ${(annualRate * 100).toFixed(1)}% p.a.`,
            reason: 'Payment clause conflict: Invoice settlement timeline is significantly more restrictive than agreed MSA/Contract.',
            source_document_id: invoice!.id,
            compared_document_id: contract!.id,
            source_value: invoicePaymentTerms,
            compared_value: contractPaymentTerms,
            financial_impact: Math.round(costOfCapital * 100) / 100,
            variance: daysDiff,
            currency,
            calculation_method: 'Capital Cost = Invoice Total * (Days Accelerated / 365) * Cost of Capital Rate',
            source_field: 'payment_terms',
            compared_field: 'payment_terms',
            reconciliation_group_id: reconGroupId,
          })
        );
      } else if (invoiceDays > contractDays) {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_PAYMENT_TERMS_MISMATCH',
            finding_type: 'missing_field',
            severity: 'medium',
            title: 'Payment terms conflict (Contract vs Invoice)',
            description: `Contract stipulates payment terms "${contractPaymentTerms}", but invoice specifies "${invoicePaymentTerms}".`,
            reason: 'Terms divergence: Invoiced credit/payment terms deviate from negotiated contract obligations.',
            source_document_id: invoice!.id,
            compared_document_id: contract!.id,
            source_value: invoicePaymentTerms,
            compared_value: contractPaymentTerms,
            source_field: 'payment_terms',
            compared_field: 'payment_terms',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    } else if (normalizeString(contractPaymentTerms) !== normalizeString(invoicePaymentTerms)) {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          rule_id: 'RULE_PAYMENT_TERMS_MISMATCH',
          finding_type: 'missing_field',
          severity: 'high',
          title: 'Payment terms conflict (Contract vs Invoice)',
          description: `Contract stipulates payment terms "${contractPaymentTerms}", but invoice specifies "${invoicePaymentTerms}".`,
          reason: 'Terms divergence: Invoiced credit/payment terms deviate from negotiated contract obligations.',
          source_document_id: invoice!.id,
          compared_document_id: contract!.id,
          source_value: invoicePaymentTerms,
          compared_value: contractPaymentTerms,
          source_field: 'payment_terms',
          compared_field: 'payment_terms',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  } else if (poPaymentTerms && invoicePaymentTerms) {
    if (normalizeString(poPaymentTerms) !== normalizeString(invoicePaymentTerms)) {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          rule_id: 'RULE_PAYMENT_TERMS_MISMATCH',
          finding_type: 'missing_field',
          severity: 'medium',
          title: 'Payment terms conflict (PO vs Invoice)',
          description: `Purchase order authorized terms "${poPaymentTerms}", but invoice specifies "${invoicePaymentTerms}".`,
          reason: 'Terms divergence: Invoiced payment terms deviate from purchase order terms.',
          source_document_id: invoice!.id,
          compared_document_id: purchaseOrder!.id,
          source_value: invoicePaymentTerms,
          compared_value: poPaymentTerms,
          source_field: 'payment_terms',
          compared_field: 'payment_terms',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 13. Customer Identity Verification
  const contractCustomer = contract ? getFieldValue(contract.fields, 'customer_name') : null;
  const poCustomer = purchaseOrder ? getFieldValue(purchaseOrder.fields, 'customer_name') : null;
  const invoiceCustomer = invoice ? getFieldValue(invoice.fields, 'customer_name') : null;

  if (contractCustomer && poCustomer) {
    const custCmp = compareSupplierNames(contractCustomer, poCustomer);
    if (custCmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          rule_id: 'RULE_CUSTOMER_MISMATCH',
          finding_type: 'supplier_mismatch',
          severity: 'high',
          title: 'Customer name mismatch (Contract vs PO)',
          description: `Contract customer "${contractCustomer}" differs from purchase order buyer "${poCustomer}".`,
          reason: 'Entity identification check: Buyer entity on purchase order does not match contracted client entity.',
          source_document_id: purchaseOrder!.id,
          compared_document_id: contract!.id,
          source_value: poCustomer,
          compared_value: contractCustomer,
          source_field: 'customer_name',
          compared_field: 'customer_name',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  if (poCustomer && invoiceCustomer) {
    const custCmp = compareSupplierNames(poCustomer, invoiceCustomer);
    if (custCmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          rule_id: 'RULE_CUSTOMER_MISMATCH',
          finding_type: 'supplier_mismatch',
          severity: 'high',
          title: 'Customer name mismatch (PO vs Invoice)',
          description: `Purchase order customer "${poCustomer}" differs from invoice billed customer "${invoiceCustomer}".`,
          reason: 'Entity identification check: Billed entity does not match authorized buyer entity.',
          source_document_id: invoice!.id,
          compared_document_id: purchaseOrder!.id,
          source_value: invoiceCustomer,
          compared_value: poCustomer,
          source_field: 'customer_name',
          compared_field: 'customer_name',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // 14. Discount Discrepancy
  if (purchaseOrder && invoice) {
    const poDiscount = getNumericValue(purchaseOrder.fields, 'discount');
    const invDiscount = getNumericValue(invoice.fields, 'discount');

    if (poDiscount !== null && poDiscount > 0) {
      if (invDiscount === null || invDiscount < poDiscount - 0.05) {
        const discountDiff = poDiscount - (invDiscount || 0);
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_DISCOUNT_DISCREPANCY',
            finding_type: 'amount_mismatch',
            severity: 'high',
            title: 'Agreed purchase order discount not applied on invoice',
            description: `PO specifies an authorized discount of ${currency} ${poDiscount.toLocaleString('en-IN')}, but invoice only applied ${currency} ${(invDiscount || 0).toLocaleString('en-IN')} (${currency} ${discountDiff.toLocaleString('en-IN')} variance).`,
            reason: 'Pricing variance: Invoiced amounts fail to apply negotiated discount approved on purchase order.',
            source_document_id: invoice.id,
            compared_document_id: purchaseOrder.id,
            source_value: invDiscount ? invDiscount.toString() : '0',
            compared_value: poDiscount.toString(),
            variance: discountDiff,
            financial_impact: discountDiff,
            currency,
            calculation_method: 'Discount Variance = PO Authorized Discount - Invoice Applied Discount',
            source_field: 'discount',
            compared_field: 'discount',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }
  }

  // 15. Indian Fiscal Checks (GSTIN, Tax Types, Rates & HSN)
  if (invoice) {
    const supplierGstin = getFieldValue(invoice.fields, 'supplier_gstin') || getFieldValue(invoice.fields, 'gstin');
    const customerGstin = getFieldValue(invoice.fields, 'customer_gstin') || getFieldValue(invoice.fields, 'buyer_gstin');

    // Supplier GSTIN validation
    if (supplierGstin) {
      const suppResult = validateGstin(supplierGstin);
      if (!suppResult.isValid) {
        overallStatus = 'discrepancy';
        const isChecksum = suppResult.errorType === 'CHECKSUM_FAILURE';
        findings.push(
          makeFinding({
            rule_id: isChecksum ? 'RULE_GSTIN_CHECKSUM_FAILURE' : 'RULE_GSTIN_INVALID_FORMAT',
            finding_type: 'data_validation',
            severity: 'high',
            title: isChecksum ? 'Supplier GSTIN failed checksum verification' : 'Invalid Supplier GSTIN format',
            description: suppResult.error || `Supplier GSTIN "${supplierGstin}" is invalid.`,
            reason: 'Statutory compliance validation: Supplier GSTIN must be a valid 15-character alphanumeric identifier with valid Luhn-mod-36 checksum.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: supplierGstin,
            compared_value: null,
            calculation_method: 'Luhn-mod-36 statutory checksum verification',
            source_field: 'supplier_gstin',
            source_page: invoice.fields['supplier_gstin']?.source_page ?? 1,
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    // Customer GSTIN validation
    if (customerGstin) {
      const custResult = validateGstin(customerGstin);
      if (!custResult.isValid) {
        overallStatus = 'discrepancy';
        const isChecksum = custResult.errorType === 'CHECKSUM_FAILURE';
        findings.push(
          makeFinding({
            rule_id: isChecksum ? 'RULE_GSTIN_CHECKSUM_FAILURE' : 'RULE_GSTIN_INVALID_FORMAT',
            finding_type: 'data_validation',
            severity: 'high',
            title: isChecksum ? 'Buyer GSTIN failed checksum verification' : 'Invalid Buyer GSTIN format',
            description: custResult.error || `Buyer GSTIN "${customerGstin}" is invalid.`,
            reason: 'Statutory compliance validation: Buyer GSTIN must be a valid 15-character alphanumeric identifier with valid Luhn-mod-36 checksum.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: customerGstin,
            compared_value: null,
            calculation_method: 'Luhn-mod-36 statutory checksum verification',
            source_field: 'customer_gstin',
            source_page: invoice.fields['customer_gstin']?.source_page ?? 1,
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    // Tax Type Consistency (Intra-state CGST+SGST vs Inter-state IGST)
    const cgst = getNumericValue(invoice.fields, 'cgst');
    const sgst = getNumericValue(invoice.fields, 'sgst');
    const igst = getNumericValue(invoice.fields, 'igst');

    if (supplierGstin && customerGstin) {
      const taxTypeResult = validateGstTaxType(supplierGstin, customerGstin, cgst, sgst, igst);
      if (!taxTypeResult.isConsistent) {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_GST_TYPE_INCONSISTENT',
            finding_type: 'tax_discrepancy',
            severity: 'high',
            title: 'GST tax structure inconsistent with place of supply',
            description: taxTypeResult.error || 'GST tax components do not match place of supply rules.',
            reason: 'Statutory tax rule: Intra-state transactions must charge equal CGST + SGST; inter-state transactions must charge IGST.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: `CGST: ${cgst ?? 0}, SGST: ${sgst ?? 0}, IGST: ${igst ?? 0}`,
            compared_value: `Supply Type: ${taxTypeResult.supplyType}`,
            calculation_method: 'Place of supply determination via 2-digit GSTIN state codes',
            source_field: 'tax',
            financial_impact: Math.max(cgst ?? 0, sgst ?? 0, igst ?? 0),
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    // Tax Rate Sanity (Check against official slabs 0, 5, 12, 18, 28, 0.25, 3)
    const subtotal = getNumericValue(invoice.fields, 'subtotal');
    const tax = getNumericValue(invoice.fields, 'tax');
    if (subtotal !== null && tax !== null && subtotal > 0 && tax > 0) {
      const effectiveRate = (tax / subtotal) * 100;
      const slabCheck = validateGstRateSlab(effectiveRate);
      if (!slabCheck.isValid) {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            rule_id: 'RULE_GST_RATE_UNUSUAL',
            finding_type: 'tax_discrepancy',
            severity: 'medium',
            title: `Unusual GST rate detected (${effectiveRate.toFixed(2)}%)`,
            description: `Effective tax rate of ${effectiveRate.toFixed(2)}% on subtotal ${currency} ${subtotal.toLocaleString('en-IN')} (tax: ${currency} ${tax.toLocaleString('en-IN')}) does not match any statutory GST rate slab (0%, 5%, 12%, 18%, 28%, 0.25%, 3%).`,
            reason: 'GST rate sanity check failed: Effective rate deviates from standard statutory slabs.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: `${effectiveRate.toFixed(2)}%`,
            compared_value: 'Official Slabs: 0%, 5%, 12%, 18%, 28%',
            variance: effectiveRate,
            calculation_method: 'Effective Tax Rate = (Tax / Subtotal) * 100',
            source_field: 'tax',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }

    // Mandatory HSN / SAC Code Presence
    const requireHsn = config?.require_hsn_codes ?? false;
    if (requireHsn && invoice.lineItems.length > 0) {
      for (const item of invoice.lineItems) {
        const itemText = `${item.description || ''} ${(item as { hsn?: string }).hsn || ''}`;
        if (!hasHsnSacCode(itemText)) {
          overallStatus = 'discrepancy';
          findings.push(
            makeFinding({
              rule_id: 'RULE_HSN_CODE_MISSING',
              finding_type: 'missing_field',
              severity: 'medium',
              title: `Missing HSN/SAC code on line item (${item.description || 'Item'})`,
              description: `Line item "${item.description || 'Unnamed item'}" does not include a valid 4-, 6-, or 8-digit HSN/SAC code as mandated by organization tax compliance policy.`,
              reason: 'Mandatory HSN/SAC policy check failed.',
              source_document_id: invoice.id,
              compared_document_id: null,
              source_value: null,
              compared_value: 'Mandatory HSN/SAC',
              source_field: 'description',
              source_page: item.source_page ?? 1,
              reconciliation_group_id: reconGroupId,
            })
          );
        }
      }
    }
  }

  // Filter findings based on organization enabled_rules configuration if specified
  const enabledRules = config?.enabled_rules;
  let finalFindings = findings;
  if (enabledRules && enabledRules.length > 0) {
    const enabledSet = new Set(enabledRules);
    finalFindings = findings.filter((f) => !f.rule_id || enabledSet.has(f.rule_id));
    if (finalFindings.length === 0 && overallStatus === 'discrepancy') {
      overallStatus = 'matched';
    }
  }

  return {
    status: overallStatus,
    findings: finalFindings,
    contractValue,
    poValue: poTotal,
    invoiceValue: invoiceTotal,
    variance,
    variancePercentage,
    currency,
    vendorName,
    contractStatus:
      contractValue !== null && invoiceTotal !== null
        ? invoiceTotal <= contractValue
          ? 'WITHIN_CONTRACT_LIMIT'
          : 'EXCEEDS_CONTRACT'
        : 'NOT_COMPARABLE',
    poToInvoiceStatus:
      invoiceTotal !== null && poTotal !== null
        ? compareNumeric(invoiceTotal, poTotal, 0.0001, amountToleranceAbs)
        : 'NOT_COMPARABLE',
    cumulativeBilled,
    remainingPoBalance,
    remainingContractBalance,
    goodsReceiptMatched,
  };
}
