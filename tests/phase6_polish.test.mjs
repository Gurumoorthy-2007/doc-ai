// ============================================================
// DocuSentinel AI — Phase 6 Polish & Enterprise Readiness Tests
// Tests for Dispute Letter Generation, Review Workflow Actions,
// Reconciliation Export (CSV/JSON/PDF), and Settings Management.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVendorDisputeLetter } from '../src/lib/reconciliation/dispute.ts';
import { ServerPersistence } from '../src/lib/server/persistence.ts';

test('Phase 6 Polish 1: Deterministic Vendor Dispute Letter Generation', async () => {
  const dummyFinding = {
    id: 'F-9021',
    user_id: 'usr-acct-01',
    reconciliation_group_id: 'grp-test-01',
    finding_type: 'unit_price_discrepancy',
    severity: 'high',
    status: 'open',
    title: 'Line Item Unit Price Mismatch',
    rule_id: 'RULE_UNIT_PRICE_MISMATCH',
    description: 'Invoice unit price ₹ 1,450.00 exceeds Purchase Order agreed rate of ₹ 1,200.00.',
    reason: 'Price variance',
    source_document_id: 'doc-inv-01',
    compared_document_id: 'doc-po-01',
    source_value: '₹ 1,450.00',
    compared_value: '₹ 1,200.00',
    variance: 250.0,
    financial_impact: 25000.0,
    currency: 'INR',
    source_field: 'unit_price',
    source_page: 1,
    source_text: 'Unit Rate: ₹ 1,450.00',
    source_verified: true,
    compared_field: 'unit_price',
    compared_page: 2,
    compared_text: 'Agreed Rate: ₹ 1,200.00',
    compared_verified: true,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const letter = generateVendorDisputeLetter({
    finding: dummyFinding,
    vendorName: 'Acme Technologies Ltd',
    invoiceNumber: 'INV-2026-9901',
    poNumber: 'PO-7741',
    organizationName: 'Global Enterprise AP Operations',
    senderName: 'Jane Doe',
    senderTitle: 'Senior Commercial Auditor',
    actionRequiredDays: 5,
  });

  assert.ok(letter.referenceNumber.startsWith('DISP-'), 'Reference number must start with DISP-');
  assert.ok(letter.subject.includes('INV-2026-9901'), 'Subject must cite invoice number');
  assert.ok(letter.bodyText.includes('Acme Technologies Ltd'), 'Body must address the vendor');
  assert.ok(letter.bodyText.includes('Jane Doe (Senior Commercial Auditor)'), 'Body must cite auditor');
  assert.ok(letter.bodyText.includes('RULE_UNIT_PRICE_MISMATCH'), 'Body must cite specific audit rule');
  assert.ok(letter.bodyText.includes('Invoice Passage (Page 1): "Unit Rate: ₹ 1,450.00"'), 'Body must cite verified invoice passage');
  assert.ok(letter.bodyText.includes('Option A (Credit Note)'), 'Body must provide Credit Note remediation option');
  assert.ok(letter.bodyText.includes('5 business days'), 'Body must specify action deadline');
});

test('Phase 6 Polish 2: Finding Status Transition to Disputed and Escalated', async () => {
  // Create a test finding in ServerPersistence
  const findingId = `F-TEST-${Date.now()}`;
  const testFinding = {
    id: findingId,
    user_id: 'usr-test-runner',
    reconciliation_group_id: 'grp-test-review',
    finding_type: 'quantity_discrepancy',
    severity: 'critical',
    status: 'open',
    title: 'Billed Beyond Received Warehouse Count',
    rule_id: 'RULE_GRN_QUANTITY_MISMATCH',
    description: 'Invoice billed 100 units but Goods Receipt Note shows only 85 received.',
    reason: 'Short delivery',
    source_document_id: `doc-inv-${findingId}`,
    compared_document_id: `doc-grn-${findingId}`,
    source_value: '100',
    compared_value: '85',
    variance: 15,
    financial_impact: 15000,
    currency: 'USD',
    source_field: 'quantity',
    source_page: 1,
    source_text: 'Qty: 100',
    compared_field: 'received_quantity',
    compared_page: 1,
    compared_text: 'Received Qty: 85',
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await ServerPersistence.saveFindings([testFinding]);

  // Test Disputed Action
  const disputedResult = await ServerPersistence.updateFindingReview(
    findingId,
    'disputed',
    'Short shipment confirmed by warehouse dock manager. Disputing 15 units.',
    'Lead Auditor',
    'auditor@example.com'
  );

  assert.ok(disputedResult, 'Updated finding must be returned');
  assert.equal(disputedResult.status, 'disputed', 'Status must transition to disputed');
  assert.equal(disputedResult.is_reviewed, true, 'is_reviewed must be true');
  assert.equal(disputedResult.review_decision, 'disputed', 'Review decision must record disputed');
  assert.ok(disputedResult.decision_history?.some((h) => h.decision === 'disputed'), 'History must record disputed');

  // Test Escalated Action
  const escalatedResult = await ServerPersistence.updateFindingReview(
    findingId,
    'escalated',
    'Escalating to VP of Procurement due to repeated vendor short shipments.',
    'Lead Auditor',
    'auditor@example.com'
  );

  assert.ok(escalatedResult);
  assert.equal(escalatedResult.status, 'escalated', 'Status must transition to escalated');
  assert.equal(escalatedResult.review_decision, 'escalated');
  assert.ok(escalatedResult.decision_history?.some((h) => h.decision === 'escalated'), 'History must record escalated');
});

test('Phase 6 Polish 3: OrganizationConfig Persistence with Custom Tolerances', async () => {
  const customConfig = {
    organization_id: 'org-enterprise-beta',
    price_tolerance_pct: 2.5,
    amount_tolerance_abs: 150.0,
    qty_tolerance_pct: 1.0,
    cost_of_capital_annual_rate: 0.15,
    require_grn: true,
    enabled_rules: ['RULE_UNIT_PRICE_MISMATCH', 'RULE_GRN_DAMAGE_REJECTED', 'RULE_GSTIN_CHECKSUM_FAILURE'],
    enforce_gstin_checksum: true,
    buyer_gstin: '27AAPFU0939F1ZV',
    buyer_state_code: '27',
    currency_default: 'INR',
  };

  const saved = await ServerPersistence.saveOrgConfig(customConfig);
  assert.equal(saved.price_tolerance_pct, 2.5);
  assert.equal(saved.amount_tolerance_abs, 150.0);
  assert.equal(saved.require_grn, true);
  assert.equal(saved.buyer_state_code, '27');

  const retrieved = await ServerPersistence.getOrgConfig('org-enterprise-beta');
  assert.ok(retrieved);
  assert.equal(retrieved.price_tolerance_pct, 2.5);
  assert.equal(retrieved.cost_of_capital_annual_rate, 0.15);
  assert.equal(retrieved.buyer_gstin, '27AAPFU0939F1ZV');
  assert.deepEqual(retrieved.enabled_rules, ['RULE_UNIT_PRICE_MISMATCH', 'RULE_GRN_DAMAGE_REJECTED', 'RULE_GSTIN_CHECKSUM_FAILURE']);
});

test('Phase 6 Polish 4: Reconciliation Group Status and Audit Chain Verification', async () => {
  const testGroup = {
    id: `rec-export-test-${Date.now()}`,
    user_id: 'usr-export-tester',
    name: 'Export Test Portfolio',
    contract_id: null,
    purchase_order_id: null,
    invoice_id: null,
    goods_receipt_id: null,
    status: 'discrepancy',
    contract_value: 500000,
    po_value: 400000,
    invoice_value: 420000,
    variance: 20000,
    variance_percentage: 5.0,
    currency: 'USD',
    vendor_name: 'Apex Solutions',
    reconciled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await ServerPersistence.saveReconciliationGroup(testGroup);
  const fetched = await ServerPersistence.getReconciliationGroupById(testGroup.id);
  assert.ok(fetched);
  assert.equal(fetched.vendor_name, 'Apex Solutions');
  assert.equal(fetched.variance, 20000);

  // Check audit chain validity
  const auditVerification = await ServerPersistence.verifyAuditChain();
  assert.equal(auditVerification.verified, true, 'Audit chain must be cryptographically valid');
});
