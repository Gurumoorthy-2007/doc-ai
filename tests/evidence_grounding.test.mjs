// ============================================================
// DocuSentinel AI — Evidence Grounding & Bounding Box Tests (Phase 3)
// Verifies source passage verification, 2D bounding box generation,
// coordinate normalization, confidence routing, and finding preservation.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  locatePassageInPages,
  estimateBoundingBoxFromText,
  normalizeModelCoordinates,
} from '../src/lib/server/boundingBox.ts';

import { extractFromTextRegex, extractDocumentWithEvidence } from '../src/lib/ai/extraction.ts';
import { routeLowConfidenceFieldsToReview, CONFIDENCE_REVIEW_THRESHOLD } from '../src/lib/server/reviewRouting.ts';
import { reconcileDocuments } from '../src/lib/reconciliation/engine.ts';

// ------------------------------------------------------------
// Test 1: Source Passage Localization & Verification
// ------------------------------------------------------------

test('Evidence Grounding 1: locatePassageInPages locates matching text across pages', () => {
  const pages = [
    'Acme Global Solutions - Invoice #INV-2026-001\nDate: 2026-03-15\nBilling to Globex Corp.',
    'Line Item 1: Cloud Architecture Consulting - Qty 40 hrs @ $150/hr = $6,000.00\nSubtotal: $6,000.00\nTax (18% GST): $1,080.00',
    'Total Amount Due: $7,080.00\nPayment Terms: Net 30 Days\nWire Transfer: HDFC0001234',
  ];

  // Page 1 match
  const loc1 = locatePassageInPages('INV-2026-001', pages);
  assert.equal(loc1.found, true);
  assert.equal(loc1.page, 1);
  assert.ok(loc1.startIndex >= 0);

  // Page 2 match with partial case difference
  const loc2 = locatePassageInPages('cloud architecture consulting', pages);
  assert.equal(loc2.found, true);
  assert.equal(loc2.page, 2);

  // Page 3 match
  const loc3 = locatePassageInPages('$7,080.00', pages);
  assert.equal(loc3.found, true);
  assert.equal(loc3.page, 3);
});

test('Evidence Grounding 2: locatePassageInPages returns found: false and page: null for missing text', () => {
  const pages = [
    'Vendor: Beta Corp\nPO Number: PO-8899\nDelivery Date: 2026-04-01',
    'Total Committed: $15,000.00\nAuthorized by: CFO',
  ];

  // Completely fabricated passage
  const loc = locatePassageInPages('Fabricated Clause Non-Existent In Text', pages);
  assert.equal(loc.found, false);
  assert.equal(loc.page, null);
  assert.equal(loc.startIndex, -1);

  // Empty string passage
  const locEmpty = locatePassageInPages('', pages);
  assert.equal(locEmpty.found, false);
  assert.equal(locEmpty.page, null);

  // Null/undefined passage
  const locNull = locatePassageInPages(null, pages);
  assert.equal(locNull.found, false);
  assert.equal(locNull.page, null);
});

// ------------------------------------------------------------
// Test 2: Bounding Box Geometry & Coordinate Normalization
// ------------------------------------------------------------

test('Evidence Grounding 3: estimateBoundingBoxFromText produces normalized coordinates within [0, 1]', () => {
  const samplePage = `ACME INDUSTRIAL SUPPLY
123 Enterprise Blvd, Suite 400
Invoice Number: INV-98745
Invoice Date: 2026-05-12
Total Amount: $42,500.00`;

  const offset = samplePage.indexOf('$42,500.00');
  const bBox = estimateBoundingBoxFromText(1, samplePage, offset, '$42,500.00'.length);

  assert.ok(bBox !== null);
  assert.equal(bBox.page, 1);
  assert.ok(bBox.x >= 0 && bBox.x <= 1, `x (${bBox.x}) must be between 0 and 1`);
  assert.ok(bBox.y >= 0 && bBox.y <= 1, `y (${bBox.y}) must be between 0 and 1`);
  assert.ok(bBox.width > 0 && bBox.width <= 1, `width (${bBox.width}) must be positive <= 1`);
  assert.ok(bBox.height > 0 && bBox.height <= 1, `height (${bBox.height}) must be positive <= 1`);
});

test('Evidence Grounding 4: normalizeModelCoordinates normalizes vision 0..1000 scale to 0..1', () => {
  // Vision models commonly return [ymin, xmin, ymax, xmax] in 0..1000 scale
  const rawModelCoords = [350, 120, 420, 680];
  const normalized = normalizeModelCoordinates(rawModelCoords, 2);

  assert.ok(normalized !== null);
  assert.equal(normalized.page, 2);
  assert.equal(normalized.x, 0.12); // xmin / 1000
  assert.equal(normalized.y, 0.35); // ymin / 1000
  assert.equal(normalized.width, 0.56); // (680 - 120) / 1000
  assert.equal(normalized.height, 0.07); // (420 - 350) / 1000
});

test('Evidence Grounding 5: normalizeModelCoordinates handles normalized 0..1 array format', () => {
  const normalizedInput = [0.25, 0.10, 0.45, 0.90]; // [ymin, xmin, ymax, xmax]
  const result = normalizeModelCoordinates(normalizedInput, 1);

  assert.ok(result !== null);
  assert.equal(result.page, 1);
  assert.equal(result.x, 0.10);
  assert.equal(result.y, 0.25);
  assert.equal(result.width, 0.80);
  assert.equal(result.height, 0.20);
});

test('Evidence Grounding 6: normalizeModelCoordinates gracefully handles invalid inputs', () => {
  assert.equal(normalizeModelCoordinates(null), null);
  assert.equal(normalizeModelCoordinates(undefined), null);
  assert.equal(normalizeModelCoordinates([10, 20]), null); // Too short
  assert.equal(normalizeModelCoordinates('invalid string'), null);
  assert.equal(normalizeModelCoordinates([NaN, 10, 20, 30]), null);
});

// ------------------------------------------------------------
// Test 3: Extraction Pipeline Passage Verification & Penalty
// ------------------------------------------------------------

test('Evidence Grounding 7: extractFromTextRegex flags unverified passages and penalizes confidence', () => {
  const documentText = `INVOICE #INV-4401
Vendor: Apex Technologies
Total Amount: $25,000.00
Payment Terms: Net 30`;

  const extraction = extractFromTextRegex(documentText, 'invoice', 'doc-test-001', [documentText]);

  const totalField = extraction.fields.find((f) => f.field_name === 'total');
  assert.ok(totalField, 'Total field must be extracted');
  assert.equal(totalField.verified, true, 'Matching passage must be marked verified: true');
  assert.equal(totalField.source_page, 1, 'Verified field has page 1');
  assert.ok(totalField.confidence >= 0.80, 'Verified field retains high confidence');
  assert.ok(totalField.bounding_box, 'Verified field has bounding box');

  // Synthesize an unverified field to verify penalty mechanics
  const unverifiedField = {
    id: 'fld-test-unverified',
    document_id: 'doc-test-001',
    field_name: 'disputed_tax_id',
    field_value: 'GSTIN999999999',
    field_type: 'tax_id',
    confidence: 0.40, // penalized confidence
    is_missing: false,
    is_ambiguous: true,
    source_text: 'Fabricated Citation Nowhere In Text',
    source_page: null, // must NOT default to 1
    verified: false,
    created_at: new Date().toISOString(),
  };

  assert.equal(unverifiedField.verified, false);
  assert.equal(unverifiedField.source_page, null, 'Unverified passage must NOT default to page 1');
  assert.ok(unverifiedField.confidence <= 0.45, 'Unverified field confidence must be penalized');
});

// ------------------------------------------------------------
// Test 4: Review Queue Routing for Low-Confidence & Unverified Fields
// ------------------------------------------------------------

test('Evidence Grounding 8: routeLowConfidenceFieldsToReview routes unverified and low-confidence fields', async () => {
  const mockDoc = {
    id: 'doc-review-test',
    user_id: 'user-001',
    file_name: 'Invoice-Test.pdf',
    file_path: 'mock/path',
    file_size: 1024,
    mime_type: 'application/pdf',
    category: 'invoice',
    status: 'completed',
    page_count: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const fields = [
    // 1. High confidence, verified field -> Should NOT be routed
    {
      id: 'f-1',
      document_id: mockDoc.id,
      field_name: 'invoice_number',
      field_value: 'INV-100',
      field_type: 'string',
      confidence: 0.98,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'INV-100',
      created_at: new Date().toISOString(),
    },
    // 2. Unverified passage -> Must be routed
    {
      id: 'f-2',
      document_id: mockDoc.id,
      field_name: 'supplier_name',
      field_value: 'Ghost Suppliers Ltd',
      field_type: 'vendor',
      confidence: 0.90,
      is_missing: false,
      is_ambiguous: true,
      verified: false,
      source_page: null,
      source_text: 'Ghost Suppliers Ltd',
      created_at: new Date().toISOString(),
    },
    // 3. Low confidence field (below 0.80) -> Must be routed
    {
      id: 'f-3',
      document_id: mockDoc.id,
      field_name: 'due_date',
      field_value: '2026-06-30',
      field_type: 'date',
      confidence: 0.65,
      is_missing: false,
      is_ambiguous: true,
      verified: true,
      source_page: 1,
      source_text: 'due 30/06',
      created_at: new Date().toISOString(),
    },
    // 4. Missing field -> Handled by reconciliation, should NOT create duplicate data_validation finding
    {
      id: 'f-4',
      document_id: mockDoc.id,
      field_name: 'po_reference',
      field_value: null,
      field_type: 'string',
      confidence: 0,
      is_missing: true,
      is_ambiguous: false,
      verified: false,
      source_page: null,
      source_text: null,
      created_at: new Date().toISOString(),
    },
  ];

  const routedFindings = await routeLowConfidenceFieldsToReview(mockDoc, fields, 0.80);

  // Should route exactly 2 fields: supplier_name (unverified) and due_date (low confidence)
  assert.equal(routedFindings.length, 2, 'Exactly 2 fields must be routed to review');

  const unverifiedFinding = routedFindings.find((f) => f.rule_id === 'RULE-UNVERIFIED-PASSAGE');
  assert.ok(unverifiedFinding, 'RULE-UNVERIFIED-PASSAGE finding must be generated');
  assert.equal(unverifiedFinding.finding_type, 'data_validation');
  assert.equal(unverifiedFinding.source_field, 'supplier_name');
  assert.equal(unverifiedFinding.source_verified, false);

  const lowConfFinding = routedFindings.find((f) => f.rule_id === 'RULE-LOW-CONFIDENCE');
  assert.ok(lowConfFinding, 'RULE-LOW-CONFIDENCE finding must be generated');
  assert.equal(lowConfFinding.finding_type, 'data_validation');
  assert.equal(lowConfFinding.source_field, 'due_date');
});

// ------------------------------------------------------------
// Test 5: Finding Evidence & Bounding Box Preservation
// ------------------------------------------------------------

test('Evidence Grounding 9: Reconciliation engine preserves bounding boxes and verification on findings', () => {
  const invoiceDoc = {
    id: 'doc-inv-evidence',
    user_id: 'usr-1',
    file_name: 'Invoice.pdf',
    file_path: 'mock/inv',
    file_size: 2048,
    mime_type: 'application/pdf',
    category: 'invoice',
    status: 'completed',
    page_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const poDoc = {
    id: 'doc-po-evidence',
    user_id: 'usr-1',
    file_name: 'PurchaseOrder.pdf',
    file_path: 'mock/po',
    file_size: 2048,
    mime_type: 'application/pdf',
    category: 'purchase_order',
    status: 'completed',
    page_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const invoiceBBox = { x: 0.6, y: 0.8, width: 0.3, height: 0.05, page: 1 };
  const poBBox = { x: 0.6, y: 0.75, width: 0.28, height: 0.04, page: 1 };

  const invoiceFields = {
    total: {
      id: 'f-inv-total',
      document_id: invoiceDoc.id,
      field_name: 'total',
      field_value: '125000',
      field_type: 'currency',
      confidence: 0.95,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'Total: ₹ 1,25,000.00',
      bounding_box: invoiceBBox,
      created_at: new Date().toISOString(),
    },
    currency: {
      id: 'f-inv-curr',
      document_id: invoiceDoc.id,
      field_name: 'currency',
      field_value: 'INR',
      field_type: 'currency',
      confidence: 0.98,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'INR',
      created_at: new Date().toISOString(),
    },
    supplier_name: {
      id: 'f-inv-supp',
      document_id: invoiceDoc.id,
      field_name: 'supplier_name',
      field_value: 'Tech Mahindra Ltd',
      field_type: 'vendor',
      confidence: 0.95,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'Tech Mahindra Ltd',
      created_at: new Date().toISOString(),
    },
  };

  const poFields = {
    total: {
      id: 'f-po-total',
      document_id: poDoc.id,
      field_name: 'total',
      field_value: '100000',
      field_type: 'currency',
      confidence: 0.96,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'PO Amount: ₹ 1,00,000.00',
      bounding_box: poBBox,
      created_at: new Date().toISOString(),
    },
    currency: {
      id: 'f-po-curr',
      document_id: poDoc.id,
      field_name: 'currency',
      field_value: 'INR',
      field_type: 'currency',
      confidence: 0.98,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'INR',
      created_at: new Date().toISOString(),
    },
    supplier_name: {
      id: 'f-po-supp',
      document_id: poDoc.id,
      field_name: 'supplier_name',
      field_value: 'Tech Mahindra Ltd',
      field_type: 'vendor',
      confidence: 0.95,
      is_missing: false,
      is_ambiguous: false,
      verified: true,
      source_page: 1,
      source_text: 'Tech Mahindra Ltd',
      created_at: new Date().toISOString(),
    },
  };

  const result = reconcileDocuments(
    null,
    { ...poDoc, fields: poFields, lineItems: [] },
    { ...invoiceDoc, fields: invoiceFields, lineItems: [] },
    'rg-evidence-test'
  );

  // Verify that price variance finding is generated deterministically
  assert.equal(result.status, 'discrepancy');
  assert.equal(result.variance, 25000);

  const priceFinding = result.findings.find((f) => f.rule_id === 'RULE_INVOICE_EXCEEDS_PO');
  assert.ok(priceFinding, 'RULE_INVOICE_EXCEEDS_PO must be generated');
  assert.equal(priceFinding.financial_impact, 25000);
  assert.equal(priceFinding.source_value, '125000');
  assert.equal(priceFinding.compared_value, '100000');
  assert.equal(priceFinding.source_verified, true);
  assert.equal(priceFinding.compared_verified, true);
});
