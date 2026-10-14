import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import {
  reconcileDocuments,
  parsePaymentTermsDays,
} from '../src/lib/reconciliation/engine.ts';
import {
  validateGstin,
  validateGstRateSlab,
  validateGstTaxType,
  hasHsnSacCode,
  calculateGstinChecksum,
  validateGstinChecksum,
} from '../src/lib/reconciliation/indiaGst.ts';
import {
  validateAndInspectFile,
  detectMimeType,
} from '../src/lib/server/fileStorage.ts';
import { classifyDocumentContent } from '../src/lib/server/classification.ts';
import { ServerPersistence } from '../src/lib/server/persistence.ts';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

// Helper to construct mock DocumentData
function createMockDoc(id, category, fields = {}, lineItems = []) {
  const fieldRecords = {};
  for (const [key, val] of Object.entries(fields)) {
    fieldRecords[key] = {
      id: `${id}-${key}`,
      document_id: id,
      field_name: key,
      field_value: val !== null && val !== undefined ? String(val) : null,
      field_type: typeof val === 'number' ? 'number' : 'string',
      confidence: 1,
      is_missing: val === null || val === undefined,
      is_ambiguous: false,
      source_text: String(val),
      source_page: 1,
      created_at: new Date().toISOString(),
    };
  }

  return {
    id,
    category,
    fields: fieldRecords,
    lineItems: lineItems.map((item, idx) => ({
      id: `${id}-line-${idx + 1}`,
      document_id: id,
      item_number: idx + 1,
      description: item.description,
      quantity: item.quantity ?? null,
      unit_price: item.unit_price ?? null,
      amount: item.amount ?? (item.quantity && item.unit_price ? item.quantity * item.unit_price : null),
      unit: item.unit ?? 'pcs',
      source_page: 1,
      accepted_quantity: item.accepted_quantity ?? null,
      rejected_quantity: item.rejected_quantity ?? null,
      created_at: new Date().toISOString(),
    })),
  };
}

// ============================================================
// 1. Goods-Receipt (GRN) Support & Four-Way Matching
// ============================================================

test('GRN 1: Quantity Mismatch Flagged when Invoiced Quantity Exceeds GRN (RULE_GRN_QUANTITY_MISMATCH)', () => {
  const invoice = createMockDoc(
    'inv-grn-qty',
    'invoice',
    { invoice_number: 'INV-401', supplier_name: 'Nexus Hardware Ltd', total: 100000, subtotal: 100000, tax: 0 },
    [{ description: 'Industrial Precision Sensor', quantity: 100, unit_price: 1000, amount: 100000 }]
  );

  const po = createMockDoc(
    'po-grn-qty',
    'purchase_order',
    { po_number: 'PO-401', supplier_name: 'Nexus Hardware Ltd', total: 100000 },
    [{ description: 'Industrial Precision Sensor', quantity: 100, unit_price: 1000, amount: 100000 }]
  );

  // GRN received only 80 units accepted
  const grn = createMockDoc(
    'grn-401',
    'goods_receipt',
    { grn_number: 'GRN-401', supplier_name: 'Nexus Hardware Ltd', po_reference: 'PO-401' },
    [{ description: 'Industrial Precision Sensor', quantity: 80, accepted_quantity: 80, unit_price: 1000 }]
  );

  const result = reconcileDocuments(null, po, invoice, 'recon-grn-1', grn);
  assert.equal(result.status, 'discrepancy');
  const finding = result.findings.find((f) => f.rule_id === 'RULE_GRN_QUANTITY_MISMATCH');
  assert.ok(finding, 'Must flag RULE_GRN_QUANTITY_MISMATCH');
  assert.equal(finding.severity, 'critical');
  assert.equal(finding.variance, 20); // 100 billed vs 80 accepted
  assert.equal(finding.financial_impact, 20000); // 20 * 1000
});

test('GRN 2: Damaged / Rejected Items Billed on Invoice (RULE_GRN_DAMAGE_REJECTED)', () => {
  const invoice = createMockDoc(
    'inv-grn-dmg',
    'invoice',
    { invoice_number: 'INV-402', supplier_name: 'Apex Foundry Ltd', total: 50000, subtotal: 50000, tax: 0 },
    [{ description: 'Cast Iron Bearings', quantity: 50, unit_price: 1000, amount: 50000 }]
  );

  const po = createMockDoc(
    'po-grn-dmg',
    'purchase_order',
    { po_number: 'PO-402', supplier_name: 'Apex Foundry Ltd', total: 50000 },
    [{ description: 'Cast Iron Bearings', quantity: 50, unit_price: 1000, amount: 50000 }]
  );

  // 10 units rejected due to transit damage
  const grn = createMockDoc(
    'grn-402',
    'goods_receipt',
    { grn_number: 'GRN-402', supplier_name: 'Apex Foundry Ltd', po_reference: 'PO-402' },
    [{ description: 'Cast Iron Bearings', quantity: 50, accepted_quantity: 40, rejected_quantity: 10, unit_price: 1000 }]
  );

  const result = reconcileDocuments(null, po, invoice, 'recon-grn-2', grn);
  assert.equal(result.status, 'discrepancy');
  const dmgFinding = result.findings.find((f) => f.rule_id === 'RULE_GRN_DAMAGE_REJECTED');
  assert.ok(dmgFinding, 'Must flag RULE_GRN_DAMAGE_REJECTED');
  assert.equal(dmgFinding.financial_impact, 10000); // 10 * 1000
});

test('GRN 3: Missing GRN when Four-Way Matching is Required (RULE_GRN_MISSING)', () => {
  const invoice = createMockDoc(
    'inv-grn-miss',
    'invoice',
    { invoice_number: 'INV-403', supplier_name: 'Apex Foundry Ltd', total: 50000, subtotal: 50000, tax: 0 }
  );

  const po = createMockDoc(
    'po-grn-miss',
    'purchase_order',
    { po_number: 'PO-403', supplier_name: 'Apex Foundry Ltd', total: 50000 }
  );

  const result = reconcileDocuments(null, po, invoice, 'recon-grn-3', null, {
    requireFourWayMatching: true,
  });

  assert.equal(result.status, 'discrepancy');
  const missFinding = result.findings.find((f) => f.rule_id === 'RULE_GRN_MISSING');
  assert.ok(missFinding, 'Must flag RULE_GRN_MISSING when 4-way matching is required');
  assert.equal(missFinding.severity, 'high');
  assert.equal(missFinding.financial_impact, 50000);
});

test('GRN 4: Successful 4-Way Match with Verified Quantities', () => {
  const invoice = createMockDoc(
    'inv-grn-ok',
    'invoice',
    { invoice_number: 'INV-404', supplier_name: 'Apex Foundry Ltd', total: 50000, subtotal: 50000, tax: 0, po_reference: 'PO-404' },
    [{ description: 'Cast Iron Bearings', quantity: 50, unit_price: 1000, amount: 50000 }]
  );

  const po = createMockDoc(
    'po-grn-ok',
    'purchase_order',
    { po_number: 'PO-404', supplier_name: 'Apex Foundry Ltd', total: 50000 },
    [{ description: 'Cast Iron Bearings', quantity: 50, unit_price: 1000, amount: 50000 }]
  );

  const grn = createMockDoc(
    'grn-404',
    'goods_receipt',
    { grn_number: 'GRN-404', supplier_name: 'Apex Foundry Ltd', po_reference: 'PO-404' },
    [{ description: 'Cast Iron Bearings', quantity: 50, accepted_quantity: 50, rejected_quantity: 0, unit_price: 1000 }]
  );

  const result = reconcileDocuments(null, po, invoice, 'recon-grn-4', grn, {
    requireFourWayMatching: true,
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.goodsReceiptMatched, true);
  const grnFindings = result.findings.filter((f) => f.rule_id?.startsWith('RULE_GRN_'));
  assert.equal(grnFindings.length, 0);
});

// ============================================================
// 2. Multiple Partial Invoices & Cumulative Billing
// ============================================================

test('Cumulative 1: Exceeding Authorized PO Cap via Partial Invoices (RULE_PO_CUMULATIVE_BILLED_EXCEEDED)', () => {
  const po = createMockDoc(
    'po-partial',
    'purchase_order',
    { po_number: 'PO-700', supplier_name: 'Zenith Tech', total: 100000 }
  );

  // Current Invoice #3 is for 30,000
  const currentInvoice = createMockDoc(
    'inv-partial-3',
    'invoice',
    { invoice_number: 'INV-703', supplier_name: 'Zenith Tech', po_reference: 'PO-700', total: 30000, subtotal: 30000, tax: 0 }
  );

  // Existing settled prior invoices: #1 (50,000) + #2 (35,000) = 85,000. Total with current = 115,000 > 100,000!
  const existingInvoices = [
    { id: 'inv-701', invoice_number: 'INV-701', po_reference: 'PO-700', total: 50000 },
    { id: 'inv-702', invoice_number: 'INV-702', po_reference: 'PO-700', total: 35000 },
  ];

  const result = reconcileDocuments(null, po, currentInvoice, 'recon-partial-1', null, {
    existingInvoices,
  });

  assert.equal(result.status, 'discrepancy');
  const cumFinding = result.findings.find((f) => f.rule_id === 'RULE_PO_CUMULATIVE_BILLED_EXCEEDED');
  assert.ok(cumFinding, 'Must flag RULE_PO_CUMULATIVE_BILLED_EXCEEDED');
  assert.equal(cumFinding.financial_impact, 15000); // 115,000 - 100,000
  assert.equal(result.cumulativeBilled, 115000);
  assert.equal(result.remainingPoBalance, -15000);
});

test('Cumulative 2: Exceeding Contract Cap across Multiple Invoices (RULE_CONTRACT_CUMULATIVE_BILLED_EXCEEDED)', () => {
  const contract = createMockDoc(
    'ctr-cap',
    'contract',
    { contract_number: 'CTR-800', supplier_name: 'Zenith Tech', contract_value: 200000 }
  );

  const po = createMockDoc(
    'po-cap',
    'purchase_order',
    { po_number: 'PO-800', supplier_name: 'Zenith Tech', total: 200000, contract_reference: 'CTR-800' }
  );

  const currentInvoice = createMockDoc(
    'inv-cap-curr',
    'invoice',
    { invoice_number: 'INV-803', supplier_name: 'Zenith Tech', total: 50000, subtotal: 50000, tax: 0, po_reference: 'PO-800', contract_reference: 'CTR-800' }
  );

  // Prior settled: 170,000. Total with current: 220,000 > 200,000 contract ceiling
  const existingInvoices = [
    { id: 'inv-801', invoice_number: 'INV-801', po_reference: 'PO-800', total: 100000 },
    { id: 'inv-802', invoice_number: 'INV-802', po_reference: 'PO-800', total: 70000 },
  ];

  const result = reconcileDocuments(contract, po, currentInvoice, 'recon-cap-1', null, {
    existingInvoices,
  });

  assert.equal(result.status, 'discrepancy');
  const contractFinding = result.findings.find((f) => f.rule_id === 'RULE_CONTRACT_CUMULATIVE_BILLED_EXCEEDED');
  assert.ok(contractFinding, 'Must flag RULE_CONTRACT_CUMULATIVE_BILLED_EXCEEDED');
  assert.equal(contractFinding.financial_impact, 20000);
  assert.equal(result.remainingContractBalance, -20000);
});

test('Cumulative 3: Partial Invoicing Within Authorized PO & Contract Limits', () => {
  const contract = createMockDoc(
    'ctr-ok',
    'contract',
    { contract_number: 'CTR-900', supplier_name: 'Zenith Tech', contract_value: 300000 }
  );

  const po = createMockDoc(
    'po-ok',
    'purchase_order',
    { po_number: 'PO-900', supplier_name: 'Zenith Tech', total: 150000, contract_reference: 'CTR-900' }
  );

  const currentInvoice = createMockDoc(
    'inv-ok-curr',
    'invoice',
    { invoice_number: 'INV-902', supplier_name: 'Zenith Tech', total: 40000, subtotal: 40000, tax: 0, po_reference: 'PO-900', contract_reference: 'CTR-900' }
  );

  // Prior settled: 50,000. Total: 90,000 <= 150,000 PO
  const existingInvoices = [
    { id: 'inv-901', invoice_number: 'INV-901', po_reference: 'PO-900', total: 50000 },
  ];

  const result = reconcileDocuments(contract, po, currentInvoice, 'recon-ok-1', null, {
    existingInvoices,
  });

  assert.equal(result.cumulativeBilled, 90000);
  assert.equal(result.remainingPoBalance, 60000);
  assert.equal(result.remainingContractBalance, 210000);
  assert.equal(result.findings.filter((f) => f.rule_id?.includes('CUMULATIVE')).length, 0);
});

// ============================================================
// 3. Indian Fiscal Checks (GSTIN, Tax Types, Rates & HSN)
// ============================================================

test('GSTIN 1: Valid GSTIN Verification & State Extraction', () => {
  // Real valid GSTIN formats with verified checksums
  const maharashtraGstin = '27AAPFU0939F1ZV';
  const val = validateGstin(maharashtraGstin);
  assert.equal(val.isValid, true);
  assert.equal(val.stateCode, '27');
  assert.equal(val.stateName, 'Maharashtra');
  assert.equal(val.pan, 'AAPFU0939F');

  // Checksum calculation test
  const checkChar = calculateGstinChecksum('27AAPFU0939F1Z');
  assert.equal(checkChar, 'V');
  assert.equal(validateGstinChecksum(maharashtraGstin), true);
});

test('GSTIN 2: Tampered 15th Checksum Character Fails (RULE_GSTIN_CHECKSUM_FAILURE)', () => {
  const tamperedGstin = '27AAPFU0939F1ZX'; // Corrupted checksum character
  const val = validateGstin(tamperedGstin);
  assert.equal(val.isValid, false);
  assert.ok(val.error?.includes('checksum'), 'Error must report checksum failure');

  const invoice = createMockDoc(
    'inv-gst-tamper',
    'invoice',
    { invoice_number: 'INV-GST-1', supplier_name: 'Nexus Corp', supplier_gstin: tamperedGstin, total: 10000, subtotal: 10000, tax: 0 }
  );

  const result = reconcileDocuments(null, null, invoice);
  const checkFinding = result.findings.find((f) => f.rule_id === 'RULE_GSTIN_CHECKSUM_FAILURE');
  assert.ok(checkFinding, 'Must flag RULE_GSTIN_CHECKSUM_FAILURE');
  assert.equal(checkFinding.severity, 'high');
});

test('GSTIN 3: Invalid Format or State Code Flagged (RULE_GSTIN_INVALID_FORMAT)', () => {
  const badFormatGstin = '999INVALIDGSTIN';
  const val = validateGstin(badFormatGstin);
  assert.equal(val.isValid, false);

  const invoice = createMockDoc(
    'inv-gst-fmt',
    'invoice',
    { invoice_number: 'INV-GST-2', supplier_name: 'Nexus Corp', supplier_gstin: badFormatGstin, total: 10000, subtotal: 10000, tax: 0 }
  );

  const result = reconcileDocuments(null, null, invoice);
  const fmtFinding = result.findings.find((f) => f.rule_id === 'RULE_GSTIN_INVALID_FORMAT');
  assert.ok(fmtFinding, 'Must flag RULE_GSTIN_INVALID_FORMAT');
});

test('GSTIN 4: Intra-state Supply Incorrectly Charging IGST (RULE_GST_TYPE_INCONSISTENT)', () => {
  // Both supplier and buyer in Maharashtra (27)
  const supplierGstin = '27AAPFU0939F1ZV'; // State 27
  const buyerGstin = '27AAAAA0000A1Z2'; // State 27

  // Intra-state supply incorrectly charged IGST of 18,000 instead of CGST 9,000 + SGST 9,000
  const taxCheck = validateGstTaxType(supplierGstin, buyerGstin, 0, 0, 18000);
  assert.equal(taxCheck.isConsistent, false);
  assert.equal(taxCheck.supplyType, 'intra_state');
  assert.ok(taxCheck.error?.includes('cannot charge IGST') || taxCheck.error?.includes('incorrectly charged IGST'));

  const invoice = createMockDoc(
    'inv-intra-igst',
    'invoice',
    {
      invoice_number: 'INV-GST-3',
      supplier_name: 'Nexus Corp',
      supplier_gstin: supplierGstin,
      customer_gstin: buyerGstin,
      subtotal: 100000,
      tax: 18000,
      igst: 18000,
      cgst: 0,
      sgst: 0,
      total: 118000,
    }
  );

  const result = reconcileDocuments(null, null, invoice);
  const typeFinding = result.findings.find((f) => f.rule_id === 'RULE_GST_TYPE_INCONSISTENT');
  assert.ok(typeFinding, 'Must flag RULE_GST_TYPE_INCONSISTENT for intra-state IGST');
});

test('GSTIN 5: Inter-state Supply Incorrectly Charging CGST/SGST (RULE_GST_TYPE_INCONSISTENT)', () => {
  // Supplier in Karnataka (29), Buyer in Maharashtra (27)
  const supplierGstin = '29AAAAA0000A1ZY'; // State 29 (Karnataka)
  const buyerGstin = '27AAPFU0939F1ZV'; // State 27 (Maharashtra)

  const taxCheck = validateGstTaxType(supplierGstin, buyerGstin, 9000, 9000, 0);
  assert.equal(taxCheck.isConsistent, false);
  assert.equal(taxCheck.supplyType, 'inter_state');

  const invoice = createMockDoc(
    'inv-inter-cgst',
    'invoice',
    {
      invoice_number: 'INV-GST-4',
      supplier_name: 'Bangalore Tech',
      supplier_gstin: supplierGstin,
      customer_gstin: buyerGstin,
      subtotal: 100000,
      tax: 18000,
      cgst: 9000,
      sgst: 9000,
      igst: 0,
      total: 118000,
    }
  );

  const result = reconcileDocuments(null, null, invoice);
  const typeFinding = result.findings.find((f) => f.rule_id === 'RULE_GST_TYPE_INCONSISTENT');
  assert.ok(typeFinding, 'Must flag RULE_GST_TYPE_INCONSISTENT for inter-state CGST/SGST');
});

test('GSTIN 6: Unusual GST Rate Deviating from Statutory Slabs (RULE_GST_RATE_UNUSUAL)', () => {
  // 9.3% is not a recognized GST slab
  const checkInvalid = validateGstRateSlab(9.3);
  assert.equal(checkInvalid.isValid, false);

  // 18% is valid
  const checkValid = validateGstRateSlab(18.0);
  assert.equal(checkValid.isValid, true);
  assert.equal(checkValid.matchedSlab, 18);

  const invoice = createMockDoc(
    'inv-rate-weird',
    'invoice',
    {
      invoice_number: 'INV-GST-5',
      supplier_name: 'Nexus Corp',
      subtotal: 100000,
      tax: 9300, // 9.3% rate
      total: 109300,
    }
  );

  const result = reconcileDocuments(null, null, invoice);
  const rateFinding = result.findings.find((f) => f.rule_id === 'RULE_GST_RATE_UNUSUAL');
  assert.ok(rateFinding, 'Must flag RULE_GST_RATE_UNUSUAL');
  assert.equal(rateFinding.severity, 'medium');
});

test('GSTIN 7: Mandatory HSN / SAC Code Presence Verification (RULE_HSN_CODE_MISSING)', () => {
  assert.equal(hasHsnSacCode('Precision CNC Milling HSN: 845929'), true);
  assert.equal(hasHsnSacCode('Software Development SAC 998314'), true);
  assert.equal(hasHsnSacCode('Plain generic service without any code'), false);

  const invoice = createMockDoc(
    'inv-hsn-miss',
    'invoice',
    { invoice_number: 'INV-GST-6', supplier_name: 'Nexus Corp', total: 50000, subtotal: 50000, tax: 0 },
    [{ description: 'Generic IT Consulting Services', quantity: 1, unit_price: 50000 }]
  );

  const result = reconcileDocuments(null, null, invoice, 'recon-hsn', null, {
    config: { org_id: 'org-test', require_hsn_codes: true },
  });

  const hsnFinding = result.findings.find((f) => f.rule_id === 'RULE_HSN_CODE_MISSING');
  assert.ok(hsnFinding, 'Must flag RULE_HSN_CODE_MISSING when organization policy requires HSN');
});

// ============================================================
// 4. Payment Terms & Cost of Capital
// ============================================================

test('Payment Terms 1: Deterministic Day Offset Parsing', () => {
  assert.equal(parsePaymentTermsDays('Immediate'), 0);
  assert.equal(parsePaymentTermsDays('Due Upon Receipt'), 0);
  assert.equal(parsePaymentTermsDays('Net 15'), 15);
  assert.equal(parsePaymentTermsDays('Net 30 Days'), 30);
  assert.equal(parsePaymentTermsDays('60 days'), 60);
  assert.equal(parsePaymentTermsDays('Net 90'), 90);
});

test('Payment Terms 2: Accelerated Settlement Carries Working Capital Financing Penalty (RULE_CONFLICTING_PAYMENT_TERMS)', () => {
  const contract = createMockDoc(
    'ctr-terms',
    'contract',
    { contract_number: 'CTR-60', supplier_name: 'Horizon Tech', contract_value: 500000, payment_terms: 'Net 60 Days' }
  );

  // Invoice demands Net 15 instead of agreed Net 60 (45 days earlier)
  const invoice = createMockDoc(
    'inv-terms',
    'invoice',
    { invoice_number: 'INV-60', supplier_name: 'Horizon Tech', total: 100000, subtotal: 100000, tax: 0, payment_terms: 'Net 15 Days' }
  );

  const result = reconcileDocuments(contract, null, invoice, 'recon-terms', null, {
    config: { org_id: 'org-1', annual_cost_of_capital_rate: 0.12 },
  });

  assert.equal(result.status, 'discrepancy');
  const termFinding = result.findings.find((f) => f.rule_id === 'RULE_CONFLICTING_PAYMENT_TERMS');
  assert.ok(termFinding, 'Must flag RULE_CONFLICTING_PAYMENT_TERMS');
  assert.equal(termFinding.severity, 'high');
  assert.equal(termFinding.variance, 45); // 60 - 15 = 45 days
  // 100,000 * (45 / 365) * 0.12 = 1479.45
  assert.ok(termFinding.financial_impact && Math.abs(termFinding.financial_impact - 1479.45) < 1.0);
});

test('Payment Terms 3: Equivalent Semantic Expressions Match Without Discrepancy', () => {
  const contract = createMockDoc(
    'ctr-sem-match',
    'contract',
    { contract_number: 'CTR-30', supplier_name: 'Horizon Tech', contract_value: 500000, payment_terms: 'Net 30 Days' }
  );

  const invoice = createMockDoc(
    'inv-sem-match',
    'invoice',
    { invoice_number: 'INV-30', supplier_name: 'Horizon Tech', total: 100000, subtotal: 100000, tax: 0, payment_terms: '30 days' }
  );

  const result = reconcileDocuments(contract, null, invoice);
  const termFindings = result.findings.filter((f) => f.rule_id?.includes('PAYMENT_TERMS'));
  assert.equal(termFindings.length, 0, 'Equivalent payment terms must not flag discrepancy');
});

// ============================================================
// 5. Configurable Organization Tolerances & Rule Filtering
// ============================================================

test('Config 1: Price and Amount Tolerances Override Strict Defaults', () => {
  const po = createMockDoc(
    'po-tol',
    'purchase_order',
    { po_number: 'PO-TOL-1', supplier_name: 'Atlas Spares', total: 10000 },
    [{ description: 'Titanium Bolts', quantity: 100, unit_price: 100, amount: 10000 }]
  );

  // Invoiced rate is 100.80 (+0.8% rate difference), Total is 10080 (+80 difference)
  const invoice = createMockDoc(
    'inv-tol',
    'invoice',
    { invoice_number: 'INV-TOL-1', supplier_name: 'Atlas Spares', total: 10080, subtotal: 10080, tax: 0, po_reference: 'PO-TOL-1' },
    [{ description: 'Titanium Bolts', quantity: 100, unit_price: 100.80, amount: 10080 }]
  );

  // Without configured tolerances: flags discrepancy
  const strictResult = reconcileDocuments(null, po, invoice);
  assert.equal(strictResult.status, 'discrepancy');

  // With relaxed organization tolerances (1% price tolerance, ₹100 absolute amount tolerance): passes!
  const relaxedResult = reconcileDocuments(null, po, invoice, 'recon-tol', null, {
    config: {
      org_id: 'org-custom',
      price_tolerance_percentage: 1.0, // 1%
      amount_tolerance_absolute: 100.0, // ₹100
    },
  });

  const priceFinding = relaxedResult.findings.find((f) => f.rule_id === 'RULE_LINE_ITEM_PRICE');
  assert.equal(priceFinding, undefined, 'Price within 1% tolerance should not be flagged');
  const totalFinding = relaxedResult.findings.find((f) => f.rule_id === 'RULE_INVOICE_EXCEEDS_PO');
  assert.equal(totalFinding, undefined, 'Total within ₹100 absolute tolerance should not be flagged');
});

test('Config 2: Enabled Rules Toggle Filters Inactive Rule Findings', () => {
  const po = createMockDoc(
    'po-toggle',
    'purchase_order',
    { po_number: 'PO-TOG-1', supplier_name: 'Atlas Spares', total: 10000 }
  );

  const invoice = createMockDoc(
    'inv-toggle',
    'invoice',
    { invoice_number: 'INV-TOG-1', supplier_name: 'Atlas Spares', total: 12000, subtotal: 12000, tax: 0 }
    // Note: missing po_reference intentionally
  );

  // When only RULE_INVOICE_EXCEEDS_PO is enabled
  const result = reconcileDocuments(null, po, invoice, 'recon-tog', null, {
    config: {
      org_id: 'org-selective',
      enabled_rules: ['RULE_INVOICE_EXCEEDS_PO'],
    },
  });

  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].rule_id, 'RULE_INVOICE_EXCEEDS_PO');
  const missingPoRef = result.findings.find((f) => f.rule_id === 'RULE_PO_REF_MISSING');
  assert.equal(missingPoRef, undefined, 'Disabled rules must be filtered out');
});

test('Config 3: ServerPersistence Saves and Retrieves OrganizationConfig', async () => {
  const config = {
    org_id: 'org-enterprise-test',
    org_name: 'DocuSentinel Enterprise Org',
    price_tolerance_percentage: 0.25,
    amount_tolerance_absolute: 50.0,
    quantity_tolerance_percentage: 2.0,
    require_four_way_matching: true,
    require_hsn_codes: true,
  };

  await ServerPersistence.saveOrgConfig(config);
  const fetched = await ServerPersistence.getOrgConfig('org-enterprise-test');
  assert.ok(fetched);
  assert.equal(fetched.org_id, 'org-enterprise-test');
  assert.equal(fetched.require_four_way_matching, true);
  assert.equal(fetched.price_tolerance_percentage, 0.25);
});

// ============================================================
// 6. Document Ingest for .docx and .xlsx
// ============================================================

test('Office Ingest 1: Excel Spreadsheet (.xlsx) Validation and Text Extraction', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Recon Sheet');
  sheet.addRow(['Invoice No', 'Vendor', 'Total Amount']);
  sheet.addRow(['INV-XLSX-001', 'Cloud Solutions Pvt Ltd', '75000']);
  const xlsxBuffer = await workbook.xlsx.writeBuffer();

  const validated = await validateAndInspectFile(Buffer.from(xlsxBuffer), 'invoice_spreadsheet.xlsx');
  assert.equal(validated.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(validated.extractedText.includes('INV-XLSX-001'));
  assert.ok(validated.extractedText.includes('Cloud Solutions'));
  assert.ok(validated.hash.length === 64);
});

test('Office Ingest 2: Word Document (.docx) Validation and Text Extraction', async () => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>MASTER SERVICES AGREEMENT between Acme Corp and DocuSentinel AI</w:t></w:r></w:p></w:body></w:document>'
  );

  const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const validated = await validateAndInspectFile(docxBuffer, 'contract_agreement.docx');
  assert.equal(validated.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(validated.extractedText.includes('MASTER SERVICES AGREEMENT'));
  assert.ok(validated.extractedText.includes('DocuSentinel AI'));
});

test('Office Ingest 3: Rejects Spoofed File with Incorrect Magic Bytes', async () => {
  // Plain text buffer spoofed with .xlsx extension
  const fakeBuffer = Buffer.from('Just plain text, not a zip archive');
  await assert.rejects(
    async () => {
      await validateAndInspectFile(fakeBuffer, 'spoofed.xlsx');
    },
    /invalid content headers/i
  );
});

// ============================================================
// 7. Content Classification for Goods Receipt Notes
// ============================================================

test('Classification: Identifies Goods Receipt Note Content and Filename', () => {
  const grnText = `
    GOODS RECEIPT NOTE
    GRN Number: GRN-2026-992
    Purchase Order: PO-2026-104
    Supplier: Precision Tooling Ltd
    Date Received: 2026-10-12
    Warehouse Dock: Bay 4
    Received By: Store Keeper Alex Kumar
    Quantity Received: 100 units
    Accepted Quantity: 95 units
    Rejected Quantity: 5 units (Transit damage)
  `;

  const classification = classifyDocumentContent(grnText, 'GRN_Precision_Tooling.pdf');
  assert.equal(classification.category, 'goods_receipt');
  assert.ok(classification.confidence >= 0.7);
});
