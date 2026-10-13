// ============================================================
// DocuSentinel AI — Reconciliation Engine Automated Unit Tests
// Tests actual production engine: comparison rules, 3-way matching,
// tolerances, demo scenarios, edge cases, and findings
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';

// Import genuine production engine methods directly
import {
  compareSupplierNames,
  compareStrings,
  compareNumeric,
  calculateVariance,
  checkDuplicateInvoice,
  reconcileDocuments,
  normalizeSupplierName,
} from '../src/lib/reconciliation/engine.ts';

// ------------------------------------------------------------
// 1. Supplier Name Matching (Exact, Ambiguous, Distinct)
// ------------------------------------------------------------

test('Rule 1: Exact Supplier Name Match', () => {
  assert.equal(compareSupplierNames('ABC Corp', 'ABC Corp'), 'MATCH');
});

test('Rule 2: Vendor Name Variation Matching with Corporate Suffixes', () => {
  assert.equal(compareSupplierNames('ABC Tech India Pvt Ltd', 'ABC Tech India'), 'MATCH');
  assert.equal(compareSupplierNames('Metro Supplies', 'Metro Supplies Inc'), 'MATCH');
  assert.equal(compareSupplierNames('Omni Logistics LLC', 'Omni Logistics'), 'MATCH');
  assert.equal(compareSupplierNames('Global Solutions Private Limited', 'Global Solutions Ltd'), 'MATCH');
});

test('Rule 3: Distinct Supplier Name Mismatch (No False Substring Matches)', () => {
  // Should NOT match just because "Solutions" or "Tech" is present in both
  assert.equal(compareSupplierNames('Global Solutions', 'TechSolutions'), 'MISMATCH');
  assert.equal(compareSupplierNames('Apex Systems', 'Zenith Systems'), 'MISMATCH');
  assert.equal(compareSupplierNames('Tata Consultancy', 'Tata Motors'), 'MISMATCH');
});

test('Rule 4: Empty or Missing Supplier Returns NOT_COMPARABLE', () => {
  assert.equal(compareSupplierNames(null, 'ABC Corp'), 'NOT_COMPARABLE');
  assert.equal(compareSupplierNames('ABC Corp', ''), 'NOT_COMPARABLE');
  assert.equal(compareSupplierNames(undefined, undefined), 'NOT_COMPARABLE');
});

// ------------------------------------------------------------
// 2. Currency Matching & Safety Guards
// ------------------------------------------------------------

test('Rule 5: Currency Mismatch Flagging Halts Cross-Currency Arithmetic', () => {
  const contract = {
    id: 'ctr-01',
    category: 'contract',
    fields: {
      contract_value: { field_name: 'contract_value', field_value: '1000000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'ctr-01', created_at: '' },
      currency: { field_name: 'currency', field_value: 'USD', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'ctr-01', created_at: '' },
    },
    lineItems: [],
  };

  const invoice = {
    id: 'inv-01',
    category: 'invoice',
    fields: {
      total: { field_name: 'total', field_value: '920000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-01', created_at: '' },
      currency: { field_name: 'currency', field_value: 'INR', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-01', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(contract, null, invoice);
  assert.equal(result.status, 'discrepancy');
  const currFinding = result.findings.find((f) => f.finding_type === 'currency_mismatch');
  assert.ok(currFinding, 'Currency mismatch finding must be created');
  assert.equal(currFinding.severity, 'critical');
  assert.equal(result.variance, null, 'Variance must not be computed across different currencies');
});

// ------------------------------------------------------------
// 3. Illustrative Demo Scenario: 3-Way Reconciliation
// Contract: ₹10,00,000 | PO: ₹8,50,000 | Invoice: ₹9,20,000
// ------------------------------------------------------------

test('Rule 6: 3-Way Reconciliation Demo Scenario (Variance ₹70,000 within contract)', () => {
  const contract = {
    id: 'doc-contract',
    category: 'contract',
    fields: {
      contract_number: { field_name: 'contract_number', field_value: 'CTR-2025-001', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'CTR-2025-001', source_page: 1, id: '1', document_id: 'doc-contract', created_at: '' },
      supplier_name: { field_name: 'supplier_name', field_value: 'ABC Tech India Pvt Ltd', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'ABC Tech India', source_page: 1, id: '2', document_id: 'doc-contract', created_at: '' },
      contract_value: { field_name: 'contract_value', field_value: '1000000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: '₹ 10,00,000', source_page: 1, id: '3', document_id: 'doc-contract', created_at: '' },
      currency: { field_name: 'currency', field_value: 'INR', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'INR', source_page: 1, id: '4', document_id: 'doc-contract', created_at: '' },
    },
    lineItems: [],
  };

  const po = {
    id: 'doc-po',
    category: 'purchase_order',
    fields: {
      po_number: { field_name: 'po_number', field_value: 'PO-12456', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'PO-12456', source_page: 1, id: '5', document_id: 'doc-po', created_at: '' },
      supplier_name: { field_name: 'supplier_name', field_value: 'ABC Tech India', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'ABC Tech India', source_page: 1, id: '6', document_id: 'doc-po', created_at: '' },
      total: { field_name: 'total', field_value: '850000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: '₹ 8,50,000', source_page: 1, id: '7', document_id: 'doc-po', created_at: '' },
      currency: { field_name: 'currency', field_value: 'INR', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'INR', source_page: 1, id: '8', document_id: 'doc-po', created_at: '' },
    },
    lineItems: [],
  };

  const invoice = {
    id: 'doc-inv',
    category: 'invoice',
    fields: {
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-4827', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'INV-4827', source_page: 1, id: '9', document_id: 'doc-inv', created_at: '' },
      supplier_name: { field_name: 'supplier_name', field_value: 'ABC Tech India', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'ABC Tech India', source_page: 1, id: '10', document_id: 'doc-inv', created_at: '' },
      invoice_date: { field_name: 'invoice_date', field_value: '2025-04-18', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: '2025-04-18', source_page: 1, id: '11', document_id: 'doc-inv', created_at: '' },
      total: { field_name: 'total', field_value: '920000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: '₹ 9,20,000', source_page: 1, id: '12', document_id: 'doc-inv', created_at: '' },
      currency: { field_name: 'currency', field_value: 'INR', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: 'INR', source_page: 1, id: '13', document_id: 'doc-inv', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(contract, po, invoice, 'rec-grp-demo');

  // Verify status is discrepancy because invoice > PO
  assert.equal(result.status, 'discrepancy');
  // Verify invoice-to-PO variance is exactly 70,000
  assert.equal(result.variance, 70000);
  assert.equal(result.contractValue, 1000000);
  assert.equal(result.poValue, 850000);
  assert.equal(result.invoiceValue, 920000);

  // Verify finding flags "exceeds_po_amount"
  const poExceedFinding = result.findings.find((f) => f.finding_type === 'exceeds_po_amount');
  assert.ok(poExceedFinding, 'Finding for invoice exceeding PO amount must exist');
  assert.equal(poExceedFinding.financial_impact, 70000);

  // Verify that invoice does NOT exceed contract maximum
  const contractExceedFinding = result.findings.find((f) => f.finding_type === 'exceeds_contract_value');
  assert.equal(contractExceedFinding, undefined, 'Invoice is within contract, so no exceeds_contract_value');
  assert.equal(result.contractStatus, 'WITHIN_CONTRACT_LIMIT');
});

// ------------------------------------------------------------
// 4. Exact Match & Rounding Tolerance
// ------------------------------------------------------------

test('Rule 7: Perfect Match (Zero Variance)', () => {
  assert.equal(calculateVariance(500000, 500000), 0);
  assert.equal(compareNumeric(500000, 500000), 'MATCH');
});

test('Rule 8: Decimal Rounding and Sub-Cent Tolerance', () => {
  // Minor rounding deviation within 0.05
  assert.equal(compareNumeric(10000.02, 10000.00), 'MATCH');
  // Significant deviation
  assert.equal(compareNumeric(10050.00, 10000.00), 'MISMATCH');
});

// ------------------------------------------------------------
// 5. Line Item Quantity and Rate Discrepancies
// ------------------------------------------------------------

test('Rule 9: Line Item Quantity & Price Discrepancies', () => {
  const po = {
    id: 'po-1',
    category: 'purchase_order',
    fields: {
      total: { field_name: 'total', field_value: '1000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'po-1', created_at: '' },
    },
    lineItems: [
      { id: 'li-1', document_id: 'po-1', item_number: 1, description: 'Office Chairs', quantity: 10, unit_price: 100, amount: 1000, unit: 'pcs', source_page: 1, created_at: '' },
    ],
  };

  const invoice = {
    id: 'inv-1',
    category: 'invoice',
    fields: {
      total: { field_name: 'total', field_value: '1440', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'inv-1', created_at: '' },
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-1', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-1', created_at: '' },
      invoice_date: { field_name: 'invoice_date', field_value: '2025-04-01', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-1', created_at: '' },
      supplier_name: { field_name: 'supplier_name', field_value: 'Vendor A', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '5', document_id: 'inv-1', created_at: '' },
    },
    lineItems: [
      { id: 'li-2', document_id: 'inv-1', item_number: 1, description: 'Office Chairs', quantity: 12, unit_price: 120, amount: 1440, unit: 'pcs', source_page: 1, created_at: '' },
    ],
  };

  const result = reconcileDocuments(null, po, invoice);
  const qFinding = result.findings.find((f) => f.finding_type === 'quantity_discrepancy');
  const pFinding = result.findings.find((f) => f.finding_type === 'unit_price_discrepancy');

  assert.ok(qFinding, 'Quantity discrepancy finding must be generated');
  assert.equal(qFinding.source_value, '12');
  assert.equal(qFinding.compared_value, '10');

  assert.ok(pFinding, 'Unit price discrepancy finding must be generated');
  assert.equal(pFinding.source_value, '120');
  assert.equal(pFinding.compared_value, '100');
});

// ------------------------------------------------------------
// 6. Tax Calculation Check (Subtotal + Tax = Total)
// ------------------------------------------------------------

test('Rule 10: Tax Calculation & Subtotal Arithmetic Variance', () => {
  const invoice = {
    id: 'inv-tax',
    category: 'invoice',
    fields: {
      subtotal: { field_name: 'subtotal', field_value: '10000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'inv-tax', created_at: '' },
      tax: { field_name: 'tax', field_value: '1800', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'inv-tax', created_at: '' },
      total: { field_name: 'total', field_value: '12500', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-tax', created_at: '' }, // 10000 + 1800 != 12500
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-TAX', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-tax', created_at: '' },
      invoice_date: { field_name: 'invoice_date', field_value: '2025-04-01', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '5', document_id: 'inv-tax', created_at: '' },
      supplier_name: { field_name: 'supplier_name', field_value: 'Vendor X', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '6', document_id: 'inv-tax', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, null, invoice);
  const taxFinding = result.findings.find((f) => f.finding_type === 'tax_discrepancy');
  assert.ok(taxFinding, 'Tax calculation variance must be detected');
  assert.equal(taxFinding.financial_impact, 700);
});

// ------------------------------------------------------------
// 7. Duplicate Invoice Detection
// ------------------------------------------------------------

test('Rule 11: Duplicate Invoice Detection', () => {
  const existingInvoices = [
    { id: 'doc-1', number: 'INV-4827' },
    { id: 'doc-2', number: 'INV-5112' },
  ];

  const result = checkDuplicateInvoice('INV-4827', existingInvoices, 'doc-3');
  assert.ok(result, 'Duplicate must be detected');
  assert.equal(result.finding_type, 'duplicate_invoice');
  assert.equal(result.compared_document_id, 'doc-1');

  // Same document ID is not duplicate of itself
  const selfCheck = checkDuplicateInvoice('INV-4827', existingInvoices, 'doc-1');
  assert.equal(selfCheck, null);

  // New unique invoice number
  const uniqueResult = checkDuplicateInvoice('INV-9999', existingInvoices, 'doc-3');
  assert.equal(uniqueResult, null);
});

// ------------------------------------------------------------
// 8. Missing Required Fields
// ------------------------------------------------------------

test('Rule 12: Missing Mandatory Fields Detection', () => {
  const incompleteInvoice = {
    id: 'inv-inc',
    category: 'invoice',
    fields: {
      total: { field_name: 'total', field_value: '5000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'inv-inc', created_at: '' },
      // Missing invoice_number, invoice_date, supplier_name
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, null, incompleteInvoice);
  const missingNumber = result.findings.find((f) => f.source_field === 'invoice_number');
  const missingDate = result.findings.find((f) => f.source_field === 'invoice_date');
  const missingSupplier = result.findings.find((f) => f.source_field === 'supplier_name');

  assert.ok(missingNumber, 'Missing invoice number must be flagged');
  assert.ok(missingDate, 'Missing invoice date must be flagged');
  assert.ok(missingSupplier, 'Missing supplier name must be flagged');
});

// ------------------------------------------------------------
// 9. PO Reference & Chronological Date Validation
// ------------------------------------------------------------

test('Rule 13: PO Reference Mismatch Flagging', () => {
  const po = {
    id: 'po-ref-1',
    category: 'purchase_order',
    fields: {
      po_number: { field_name: 'po_number', field_value: 'PO-2025-001', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'po-ref-1', created_at: '' },
      total: { field_name: 'total', field_value: '50000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'po-ref-1', created_at: '' },
    },
    lineItems: [],
  };

  const invoice = {
    id: 'inv-ref-1',
    category: 'invoice',
    fields: {
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-01', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-ref-1', created_at: '' },
      po_reference: { field_name: 'po_reference', field_value: 'PO-9999-WRONG', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-ref-1', created_at: '' },
      total: { field_name: 'total', field_value: '50000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '5', document_id: 'inv-ref-1', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, po, invoice);
  const poRefFinding = result.findings.find((f) => f.title === 'PO reference mismatch on invoice');
  assert.ok(poRefFinding, 'PO reference mismatch must be detected');
  assert.equal(poRefFinding.source_value, 'PO-9999-WRONG');
  assert.equal(poRefFinding.compared_value, 'PO-2025-001');
});

test('Rule 14: Missing PO Reference on Invoice Flagging', () => {
  const po = {
    id: 'po-ref-2',
    category: 'purchase_order',
    fields: {
      po_number: { field_name: 'po_number', field_value: 'PO-8888', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'po-ref-2', created_at: '' },
      total: { field_name: 'total', field_value: '50000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'po-ref-2', created_at: '' },
    },
    lineItems: [],
  };

  const invoice = {
    id: 'inv-ref-2',
    category: 'invoice',
    fields: {
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-02', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-ref-2', created_at: '' },
      total: { field_name: 'total', field_value: '50000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-ref-2', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, po, invoice);
  const missingRefFinding = result.findings.find((f) => f.title === 'Missing PO reference on invoice');
  assert.ok(missingRefFinding, 'Missing PO reference on invoice must be detected');
});

test('Rule 15: Due Date Preceding Invoice Date Flagging', () => {
  const invoice = {
    id: 'inv-date-1',
    category: 'invoice',
    fields: {
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-DATE-1', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'inv-date-1', created_at: '' },
      invoice_date: { field_name: 'invoice_date', field_value: '2025-04-20', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'inv-date-1', created_at: '' },
      due_date: { field_name: 'due_date', field_value: '2025-04-10', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'inv-date-1', created_at: '' },
      total: { field_name: 'total', field_value: '10000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-date-1', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, null, invoice);
  const dateFinding = result.findings.find((f) => f.title === 'Due date precedes invoice date');
  assert.ok(dateFinding, 'Due date preceding invoice date must be detected');
});

test('Rule 16: Invoice Date Predating Purchase Order Flagging', () => {
  const po = {
    id: 'po-date-1',
    category: 'purchase_order',
    fields: {
      po_number: { field_name: 'po_number', field_value: 'PO-DATE-1', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '1', document_id: 'po-date-1', created_at: '' },
      order_date: { field_name: 'order_date', field_value: '2025-04-15', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '2', document_id: 'po-date-1', created_at: '' },
      total: { field_name: 'total', field_value: '10000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '3', document_id: 'po-date-1', created_at: '' },
    },
    lineItems: [],
  };

  const invoice = {
    id: 'inv-date-2',
    category: 'invoice',
    fields: {
      invoice_number: { field_name: 'invoice_number', field_value: 'INV-DATE-2', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '4', document_id: 'inv-date-2', created_at: '' },
      invoice_date: { field_name: 'invoice_date', field_value: '2025-04-05', field_type: 'string', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '5', document_id: 'inv-date-2', created_at: '' },
      total: { field_name: 'total', field_value: '10000', field_type: 'number', confidence: 1, is_missing: false, is_ambiguous: false, source_text: null, source_page: 1, id: '6', document_id: 'inv-date-2', created_at: '' },
    },
    lineItems: [],
  };

  const result = reconcileDocuments(null, po, invoice);
  const predateFinding = result.findings.find((f) => f.title === 'Invoice predates purchase order');
  assert.ok(predateFinding, 'Invoice predating purchase order must be detected');
});

