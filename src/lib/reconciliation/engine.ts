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

interface DocumentData {
  id: string;
  category: string;
  fields: Record<string, ExtractedField>;
  lineItems: LineItem[];
}

interface ReconciliationResult {
  status: ReconciliationStatus;
  findings: Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'>[];
  contractValue: number | null;
  poValue: number | null;
  invoiceValue: number | null;
  variance: number | null;
  variancePercentage: number | null;
  currency: string | null;
  vendorName: string | null;
}

function getFieldValue(fields: Record<string, ExtractedField>, name: string): string | null {
  return fields[name]?.field_value ?? null;
}

function getNumericValue(fields: Record<string, ExtractedField>, name: string): number | null {
  const val = getFieldValue(fields, name);
  if (!val) return null;
  const num = parseFloat(val.replace(/[^0-9.\-]/g, ''));
  return isNaN(num) ? null : num;
}

function normalizeString(s: string | null): string {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Safe numeric comparison with configurable tolerance for rounding.
 * Returns 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE'
 */
function compareNumeric(
  a: number | null,
  b: number | null,
  tolerancePercent: number = 0.01
): 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE' {
  if (a === null || b === null) return 'NOT_COMPARABLE';
  if (a === 0 && b === 0) return 'MATCH';
  const diff = Math.abs(a - b);
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (diff <= base * tolerancePercent) return 'MATCH';
  return 'MISMATCH';
}

function compareStrings(
  a: string | null,
  b: string | null
): 'MATCH' | 'MISMATCH' | 'NOT_COMPARABLE' {
  if (!a || !b) return 'NOT_COMPARABLE';
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na || !nb) return 'NOT_COMPARABLE';
  if (na === nb) return 'MATCH';
  // Fuzzy check for vendor name variations
  if (na.includes(nb) || nb.includes(na)) return 'MATCH';
  return 'MISMATCH';
}

function makeFinding(
  params: {
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
  }
): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
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

/**
 * Core reconciliation engine. Compares contract, PO, and invoice.
 * All comparisons are deterministic — no LLM calls.
 */
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

  const currency = invoiceCurrency || poCurrency || contractCurrency;
  const vendorName = invoiceSupplier || poSupplier || contractSupplier;

  // ---- Check missing documents ----
  if (invoice && !purchaseOrder) {
    overallStatus = 'missing_po';
    findings.push(
      makeFinding({
        finding_type: 'missing_field',
        severity: 'high',
        title: 'Missing PO number',
        description: 'Invoice has no associated purchase order for reconciliation.',
        reason: 'No purchase order document found for this invoice.',
        source_document_id: invoice.id,
        compared_document_id: null,
        source_value: getFieldValue(invoice.fields, 'po_reference'),
        compared_value: null,
        reconciliation_group_id: reconGroupId,
      })
    );
  }

  if (purchaseOrder && !invoice) {
    overallStatus = 'missing_invoice';
  }

  // ---- Currency mismatch ----
  const currencies = [contractCurrency, poCurrency, invoiceCurrency].filter(Boolean);
  const uniqueCurrencies = new Set(currencies.map(c => normalizeString(c)));
  if (uniqueCurrencies.size > 1) {
    overallStatus = 'discrepancy';
    findings.push(
      makeFinding({
        finding_type: 'currency_mismatch',
        severity: 'critical',
        title: 'Currency mismatch',
        description: `Documents use different currencies: ${[...uniqueCurrencies].join(', ')}. Values cannot be safely compared without a conversion policy.`,
        reason: 'Currency mismatch across documents prevents reliable financial comparison.',
        source_document_id: invoice?.id ?? purchaseOrder?.id ?? null,
        compared_document_id: contract?.id ?? purchaseOrder?.id ?? null,
        source_value: invoiceCurrency || poCurrency || null,
        compared_value: contractCurrency || poCurrency || null,
        reconciliation_group_id: reconGroupId,
      })
    );
    // Don't compare amounts across different currencies
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

  // ---- Supplier mismatch ----
  const supplierPairs: Array<[string | null, string | null, string | null, string | null]> = [];
  if (contract && purchaseOrder) {
    supplierPairs.push([contractSupplier, poSupplier, contract.id, purchaseOrder.id]);
  }
  if (purchaseOrder && invoice) {
    supplierPairs.push([poSupplier, invoiceSupplier, purchaseOrder.id, invoice.id]);
  }
  if (contract && invoice) {
    supplierPairs.push([contractSupplier, invoiceSupplier, contract.id, invoice.id]);
  }
  for (const [a, b, srcId, cmpId] of supplierPairs) {
    const result = compareStrings(a, b);
    if (result === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          finding_type: 'supplier_mismatch',
          severity: 'high',
          title: 'Supplier name mismatch',
          description: `Supplier names differ: "${a}" vs "${b}".`,
          reason: 'Vendor/supplier names do not match across documents.',
          source_document_id: srcId,
          compared_document_id: cmpId,
          source_value: a,
          compared_value: b,
          source_field: 'supplier_name',
          compared_field: 'supplier_name',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // ---- Invoice exceeds PO amount ----
  if (invoiceTotal !== null && poTotal !== null) {
    const cmp = compareNumeric(invoiceTotal, poTotal);
    if (cmp === 'MISMATCH' && invoiceTotal > poTotal) {
      overallStatus = 'discrepancy';
      const impact = invoiceTotal - poTotal;
      findings.push(
        makeFinding({
          finding_type: 'exceeds_po_amount',
          severity: 'critical',
          title: 'Invoice exceeds PO amount',
          description: `Invoice total (${invoiceTotal}) exceeds PO total (${poTotal}) by ${impact.toFixed(2)}.`,
          reason: 'The invoice amount does not match the amount in the purchase order.',
          source_document_id: invoice!.id,
          compared_document_id: purchaseOrder!.id,
          source_value: invoiceTotal.toString(),
          compared_value: poTotal.toString(),
          financial_impact: impact,
          currency,
          source_field: 'total',
          compared_field: 'total',
          reconciliation_group_id: reconGroupId,
        })
      );
    } else if (cmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          finding_type: 'amount_mismatch',
          severity: 'high',
          title: 'Invoice amount mismatch',
          description: `Invoice total (${invoiceTotal}) does not match PO total (${poTotal}).`,
          reason: 'Amount discrepancy between invoice and purchase order.',
          source_document_id: invoice!.id,
          compared_document_id: purchaseOrder!.id,
          source_value: invoiceTotal.toString(),
          compared_value: poTotal.toString(),
          financial_impact: Math.abs(invoiceTotal - poTotal),
          currency,
          source_field: 'total',
          compared_field: 'total',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // ---- Contract value vs PO/Invoice ----
  if (contractValue !== null && poTotal !== null) {
    const cmp = compareNumeric(poTotal, contractValue);
    if (cmp === 'MISMATCH' && poTotal > contractValue) {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          finding_type: 'exceeds_contract_value',
          severity: 'critical',
          title: 'PO exceeds contract value',
          description: `PO total (${poTotal}) exceeds contract value (${contractValue}).`,
          reason: 'Purchase order value exceeds the agreed contract value.',
          source_document_id: purchaseOrder!.id,
          compared_document_id: contract!.id,
          source_value: poTotal.toString(),
          compared_value: contractValue.toString(),
          financial_impact: poTotal - contractValue,
          currency,
          source_field: 'total',
          compared_field: 'contract_value',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // ---- Payment terms comparison ----
  const contractPayTerms = contract ? getFieldValue(contract.fields, 'payment_terms') : null;
  const poPayTerms = purchaseOrder ? getFieldValue(purchaseOrder.fields, 'payment_terms') : null;
  const invPayTerms = invoice ? getFieldValue(invoice.fields, 'payment_terms') : null;

  if (contractPayTerms && poPayTerms) {
    const cmp = compareStrings(contractPayTerms, poPayTerms);
    if (cmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          finding_type: 'payment_term_mismatch',
          severity: 'medium',
          title: 'Payment term inconsistency',
          description: `Contract terms "${contractPayTerms}" differ from PO terms "${poPayTerms}".`,
          reason: 'Payment terms are inconsistent across documents.',
          source_document_id: contract!.id,
          compared_document_id: purchaseOrder!.id,
          source_value: contractPayTerms,
          compared_value: poPayTerms,
          source_field: 'payment_terms',
          compared_field: 'payment_terms',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  if (poPayTerms && invPayTerms) {
    const cmp = compareStrings(poPayTerms, invPayTerms);
    if (cmp === 'MISMATCH') {
      overallStatus = 'discrepancy';
      findings.push(
        makeFinding({
          finding_type: 'payment_term_mismatch',
          severity: 'medium',
          title: 'Payment term variation',
          description: `PO terms "${poPayTerms}" differ from invoice terms "${invPayTerms}".`,
          reason: 'Payment terms on invoice do not match purchase order.',
          source_document_id: purchaseOrder!.id,
          compared_document_id: invoice!.id,
          source_value: poPayTerms,
          compared_value: invPayTerms,
          source_field: 'payment_terms',
          compared_field: 'payment_terms',
          reconciliation_group_id: reconGroupId,
        })
      );
    }
  }

  // ---- Line item comparison (PO vs Invoice) ----
  if (purchaseOrder && invoice && purchaseOrder.lineItems.length > 0 && invoice.lineItems.length > 0) {
    const poItems = purchaseOrder.lineItems;
    const invItems = invoice.lineItems;

    // Compare quantities and unit prices
    const maxLen = Math.max(poItems.length, invItems.length);
    for (let i = 0; i < maxLen; i++) {
      const poItem = poItems[i];
      const invItem = invItems[i];

      if (!poItem && invItem) {
        findings.push(
          makeFinding({
            finding_type: 'quantity_discrepancy',
            severity: 'medium',
            title: `Extra invoice line item #${i + 1}`,
            description: `Invoice has line item "${invItem.description}" not found in PO.`,
            reason: 'Invoice contains items not present in the purchase order.',
            source_document_id: invoice.id,
            compared_document_id: purchaseOrder.id,
            source_value: invItem.description || `Item ${i + 1}`,
            compared_value: null,
            financial_impact: invItem.amount,
            currency,
            reconciliation_group_id: reconGroupId,
          })
        );
        overallStatus = 'discrepancy';
        continue;
      }
      if (poItem && !invItem) continue; // PO item not invoiced is okay

      if (poItem && invItem) {
        // Quantity check
        if (poItem.quantity !== null && invItem.quantity !== null) {
          const qCmp = compareNumeric(poItem.quantity, invItem.quantity, 0);
          if (qCmp === 'MISMATCH') {
            findings.push(
              makeFinding({
                finding_type: 'quantity_discrepancy',
                severity: 'medium',
                title: `Quantity discrepancy on item #${i + 1}`,
                description: `PO quantity (${poItem.quantity}) vs Invoice quantity (${invItem.quantity}) for "${poItem.description || invItem.description}".`,
                reason: 'Invoiced quantity does not match purchase order quantity.',
                source_document_id: purchaseOrder.id,
                compared_document_id: invoice.id,
                source_value: poItem.quantity?.toString() ?? null,
                compared_value: invItem.quantity?.toString() ?? null,
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
            findings.push(
              makeFinding({
                finding_type: 'unit_price_discrepancy',
                severity: 'medium',
                title: `Unit price discrepancy on item #${i + 1}`,
                description: `PO unit price (${poItem.unit_price}) vs Invoice unit price (${invItem.unit_price}) for "${poItem.description || invItem.description}".`,
                reason: 'Invoiced unit price does not match purchase order unit price.',
                source_document_id: purchaseOrder.id,
                compared_document_id: invoice.id,
                source_value: poItem.unit_price?.toString() ?? null,
                compared_value: invItem.unit_price?.toString() ?? null,
                financial_impact: invItem.quantity
                  ? Math.abs(poItem.unit_price - invItem.unit_price) * invItem.quantity
                  : Math.abs(poItem.unit_price - invItem.unit_price),
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

  // ---- Tax calculation verification (Invoice) ----
  if (invoice) {
    const subtotal = getNumericValue(invoice.fields, 'subtotal');
    const tax = getNumericValue(invoice.fields, 'tax');
    const total = getNumericValue(invoice.fields, 'total');

    if (subtotal !== null && tax !== null && total !== null) {
      const expectedTotal = subtotal + tax;
      const cmp = compareNumeric(expectedTotal, total);
      if (cmp === 'MISMATCH') {
        overallStatus = 'discrepancy';
        findings.push(
          makeFinding({
            finding_type: 'tax_discrepancy',
            severity: 'high',
            title: 'Tax calculation variance',
            description: `Subtotal (${subtotal}) + Tax (${tax}) = ${expectedTotal.toFixed(2)}, but invoice total is ${total}.`,
            reason: 'Invoice arithmetic: subtotal + tax does not equal total.',
            source_document_id: invoice.id,
            compared_document_id: null,
            source_value: total.toString(),
            compared_value: expectedTotal.toFixed(2),
            financial_impact: Math.abs(total - expectedTotal),
            currency,
            source_field: 'total',
            compared_field: 'calculated_total',
            reconciliation_group_id: reconGroupId,
          })
        );
      }
    }
  }

  // ---- Missing required fields ----
  const requiredFields: Record<string, string[]> = {
    invoice: ['invoice_number', 'supplier_name', 'total', 'invoice_date'],
    purchase_order: ['po_number', 'supplier_name', 'total'],
    contract: ['contract_number', 'supplier_name'],
  };

  const docsToCheck = [
    { doc: contract, type: 'contract' },
    { doc: purchaseOrder, type: 'purchase_order' },
    { doc: invoice, type: 'invoice' },
  ];

  for (const { doc, type } of docsToCheck) {
    if (!doc) continue;
    const req = requiredFields[type] || [];
    for (const field of req) {
      const val = getFieldValue(doc.fields, field);
      if (!val || val.trim() === '') {
        findings.push(
          makeFinding({
            finding_type: 'missing_field',
            severity: 'medium',
            title: `Missing ${field.replace(/_/g, ' ')}`,
            description: `Required field "${field.replace(/_/g, ' ')}" is missing or empty in the ${type.replace(/_/g, ' ')}.`,
            reason: `The ${field.replace(/_/g, ' ')} could not be extracted from the document.`,
            source_document_id: doc.id,
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

  // ---- Compute variance ----
  let variance: number | null = null;
  let variancePercentage: number | null = null;
  if (invoiceTotal !== null && poTotal !== null) {
    variance = invoiceTotal - poTotal;
    if (poTotal !== 0) {
      variancePercentage = (variance / poTotal) * 100;
    }
  }

  if (findings.length > 0 && overallStatus === 'matched') {
    // Only missing_field findings with severity medium or lower don't change status
    const hasSignificant = findings.some(f =>
      f.finding_type !== 'missing_field' || f.severity === 'high' || f.severity === 'critical'
    );
    if (hasSignificant) {
      overallStatus = 'discrepancy';
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
  };
}

/**
 * Check for duplicate invoices within a user's documents.
 */
export function checkDuplicateInvoice(
  invoiceNumber: string,
  existingInvoiceNumbers: Array<{ id: string; number: string }>,
  currentDocId: string
): Omit<Finding, 'id' | 'user_id' | 'created_at' | 'updated_at'> | null {
  if (!invoiceNumber) return null;
  
  const dup = existingInvoiceNumbers.find(
    inv => inv.number === invoiceNumber && inv.id !== currentDocId
  );
  
  if (!dup) return null;

  return makeFinding({
    finding_type: 'duplicate_invoice',
    severity: 'critical',
    title: 'Duplicate invoice detected',
    description: `Invoice number "${invoiceNumber}" already exists in the system.`,
    reason: 'A duplicate invoice with the same number was found.',
    source_document_id: currentDocId,
    compared_document_id: dup.id,
    source_value: invoiceNumber,
    compared_value: invoiceNumber,
  });
}
