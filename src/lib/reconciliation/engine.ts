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
} from '@/lib/types';

export interface DocumentData {
  id: string;
  category: string;
  fields: Record<string, ExtractedField>;
  lineItems: LineItem[];
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
 * Safe numeric comparison with configurable tolerance for rounding (default 0.01%).
 */
export function compareNumeric(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerancePercent: number = 0.0001 // 0.01%
): ComparisonOutcome {
  if (a === null || a === undefined || b === null || b === undefined) return 'NOT_COMPARABLE';
  if (a === 0 && b === 0) return 'MATCH';
  const diff = Math.abs(a - b);
  // Also accept sub-cent / rounding differences within 0.05
  if (diff <= 0.05) return 'MATCH';
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

export function checkDuplicateInvoice(
  invoiceNumber: string | null | undefined,
  existingInvoiceNumbers: Array<{ id: string; number: string }>,
  currentDocId: string
): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> | null {
  if (!invoiceNumber) return null;
  const normalizedTarget = normalizeString(invoiceNumber);
  if (!normalizedTarget) return null;

  const dup = existingInvoiceNumbers.find(
    (inv) => normalizeString(inv.number) === normalizedTarget && inv.id !== currentDocId
  );

  if (!dup) return null;

  return {
    reconciliation_group_id: null,
    finding_type: 'duplicate_invoice',
    severity: 'critical',
    status: 'open',
    title: 'Duplicate invoice detected',
    description: `Invoice number "${invoiceNumber}" matches previously processed invoice in document ${dup.id}.`,
    reason: `Duplicate invoice detection rule triggered: identical invoice number "${invoiceNumber}" found across separate documents.`,
    source_document_id: currentDocId,
    compared_document_id: dup.id,
    source_value: invoiceNumber,
    compared_value: dup.number,
    financial_impact: null,
    currency: null,
    source_field: 'invoice_number',
    source_page: 1,
    source_text: `Invoice #${invoiceNumber}`,
    compared_field: 'invoice_number',
    compared_page: 1,
    compared_text: `Invoice #${dup.number}`,
    reviewed_by: null,
    reviewed_at: null,
    source_document: null,
    compared_document: null,
    reconciliation_group: null,
    reviewer: null,
  };
}

function makeFinding(params: {
  finding_type: FindingType;
  severity: FindingSeverity;
  title: string;
  description: string;
  reason: string;
  source_document_id: string | null;
  compared_document_id: string | null;
  source_value: string | null;
  compared_value: string | null;
  financial_impact?: number | null;
  currency?: string | null;
  source_field?: string | null;
  source_page?: number | null;
  source_text?: string | null;
  compared_field?: string | null;
  compared_page?: number | null;
  compared_text?: string | null;
  reconciliation_group_id?: string | null;
}): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  return {
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
    financial_impact: params.financial_impact ?? null,
    currency: params.currency ?? null,
    source_field: params.source_field ?? null,
    source_page: params.source_page ?? null,
    source_text: params.source_text ?? null,
    compared_field: params.compared_field ?? null,
    compared_page: params.compared_page ?? null,
    compared_text: params.compared_text ?? null,
    reviewed_by: null,
    reviewed_at: null,
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
  reconGroupId?: string
): ReconciliationResult {
  const findings: Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [];
  let overallStatus: ReconciliationStatus = 'matched';

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
        currency,
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

    const cmp = compareNumeric(invoiceTotal, poTotal);
    if (cmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      if (invoiceTotal > poTotal) {
        // Positive variance: Invoice exceeds PO
        findings.push(
          makeFinding({
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
            currency,
            source_field: 'total',
            compared_field: 'total',
            source_page: invoice?.fields['total']?.source_page ?? 1,
            source_text: invoice?.fields['total']?.source_text ?? null,
            compared_page: purchaseOrder?.fields['total']?.source_page ?? 1,
            compared_text: purchaseOrder?.fields['total']?.source_text ?? null,
            reconciliation_group_id: reconGroupId,
          })
        );
      } else {
        // Negative variance: Invoiced less than PO (underbilling)
        findings.push(
          makeFinding({
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
            currency,
            source_field: 'total',
            compared_field: 'total',
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
          currency,
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
          currency,
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
            currency,
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
            currency,
            reconciliation_group_id: reconGroupId,
          })
        );
        overallStatus = 'discrepancy';
        continue;
      }

      if (poItem && invItem) {
        // Quantity check
        if (poItem.quantity !== null && invItem.quantity !== null) {
          const qCmp = compareNumeric(poItem.quantity, invItem.quantity, 0);
          if (qCmp === 'MISMATCH') {
            findings.push(
              makeFinding({
                finding_type: 'quantity_discrepancy',
                severity: 'medium',
                title: `Quantity discrepancy on line item #${i + 1}`,
                description: `PO quantity was ${poItem.quantity}, but invoice billed for ${invItem.quantity} units of "${poItem.description || invItem.description}".`,
                reason: 'Billed quantity does not match approved purchase order quantity.',
                source_document_id: invoice.id,
                compared_document_id: purchaseOrder.id,
                source_value: invItem.quantity.toString(),
                compared_value: poItem.quantity.toString(),
                financial_impact: invItem.unit_price ? Math.abs(invItem.quantity - poItem.quantity) * invItem.unit_price : null,
                currency,
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
          const pCmp = compareNumeric(poItem.unit_price, invItem.unit_price);
          if (pCmp === 'MISMATCH') {
            const priceVariance = invItem.quantity
              ? Math.abs(invItem.unit_price - poItem.unit_price) * invItem.quantity
              : Math.abs(invItem.unit_price - poItem.unit_price);

            findings.push(
              makeFinding({
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
                currency,
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
            finding_type: 'missing_field',
            severity: 'medium',
            title: `Missing ${field.replace(/_/g, ' ')}`,
            description: `Mandatory field "${field.replace(/_/g, ' ')}" could not be extracted from ${rule.type}.`,
            reason: `Forensic requirement check: ${field} is mandatory for complete reconciliation.`,
            source_document_id: rule.doc.id,
            compared_document_id: null,
            source_value: null,
            compared_value: null,
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
            finding_type: 'missing_field',
            severity: 'high',
            title: 'PO reference mismatch on invoice',
            description: `Invoice explicitly references "${invoicePoRef}", but the paired purchase order is "${poNumber}".`,
            reason: 'Invoice was issued with a mismatching purchase order identifier.',
            source_document_id: invoice.id,
            compared_document_id: purchaseOrder.id,
            source_value: invoicePoRef,
            compared_value: poNumber,
            source_field: 'po_reference',
            compared_field: 'po_number',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    } else if (!invoicePoRef) {
      findings.push(
        makeFinding({
          finding_type: 'missing_field',
          severity: 'medium',
          title: 'Missing PO reference on invoice',
          description: `Invoice does not state a PO reference number for verification against ${poNumber || 'the purchase order'}.`,
          reason: 'Forensic integrity rule: Billed invoices must state the authorizing PO reference.',
          source_document_id: invoice.id,
          compared_document_id: purchaseOrder.id,
          source_value: null,
          compared_value: poNumber,
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
            finding_type: 'missing_field',
            severity: 'high',
            title: 'Due date precedes invoice date',
            description: `Invoice due date (${dueDateStr}) occurs before the issue date (${invDateStr}).`,
            reason: 'Chronological inconsistency: Payment due date cannot precede invoice creation date.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: dueDateStr,
            compared_value: invDateStr,
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
              finding_type: 'missing_field',
              severity: 'high',
              title: 'Invoice predates purchase order',
              description: `Invoice date (${invDateStr}) predates purchase order date (${poDateStr}).`,
              reason: 'Audit control violation: Invoices cannot legitimately be issued before the authorizing purchase order exists.',
              source_document_id: invoice.id,
              compared_document_id: purchaseOrder.id,
              source_value: invDateStr,
              compared_value: poDateStr,
              source_field: 'invoice_date',
              compared_field: 'order_date',
              reconciliation_group_id: reconGroupId,
            })
          );
        }
      }
    }
  }

  return {
    status: overallStatus,
    findings,
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
        ? compareNumeric(invoiceTotal, poTotal)
        : 'NOT_COMPARABLE',
  };
}
