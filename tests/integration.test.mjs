// ============================================================
// DocuSentinel AI — End-to-End Server Integration Tests
// Tests real server modules: file validation, duplicate hashes,
// server persistence operations, and deterministic extraction
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAndInspectFile,
  calculateFileHash,
} from '../src/lib/server/fileStorage.ts';

import { ServerPersistence } from '../src/lib/server/persistence.ts';
import { extractDocumentWithEvidence } from '../src/lib/ai/extraction.ts';

test('Integration 1: File Storage Validation & SHA-256 Hash', async () => {
  const samplePdfContent = '%PDF-1.4\n1 0 obj\n<< /Title (Invoice 101) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF';
  const buffer = Buffer.from(samplePdfContent, 'utf-8');

  const inspection = await validateAndInspectFile(buffer, 'test_invoice.pdf');
  assert.equal(inspection.mimeType, 'application/pdf');
  assert.ok(inspection.hash.length === 64, 'SHA-256 hash must be 64 hexadecimal characters');

  // Verify hash matches calculateFileHash
  const manualHash = calculateFileHash(buffer);
  assert.equal(inspection.hash, manualHash);
});

test('Integration 2: Reject Unsafe or Executable File Extensions', async () => {
  const buffer = Buffer.from('console.log("malicious")', 'utf-8');
  await assert.rejects(
    async () => {
      await validateAndInspectFile(buffer, 'script.exe');
    },
    /Unsupported file format/
  );
});

test('Integration 3: Server Persistence Document Lifecycle', async () => {
  const testDocId = `test-doc-${Date.now()}`;
  const doc = await ServerPersistence.createDocument({
    id: testDocId,
    user_id: 'usr-test-01',
    file_name: 'Audit_Contract.pdf',
    file_path: `/uploads/${testDocId}.pdf`,
    file_size: 1024,
    mime_type: 'application/pdf',
    category: 'contract',
    classified_as: 'contract',
    status: 'completed',
    page_count: 5,
    processing_started_at: new Date().toISOString(),
    processing_completed_at: new Date().toISOString(),
    processing_error: null,
    processing_attempts: 1,
    file_hash: `hash-${testDocId}`,
  });

  assert.equal(doc.id, testDocId);
  assert.equal(doc.category, 'contract');

  // Retrieve document
  const retrieved = await ServerPersistence.getDocumentById(testDocId);
  assert.ok(retrieved);
  assert.equal(retrieved.file_name, 'Audit_Contract.pdf');

  // Save extracted fields
  await ServerPersistence.saveExtractedFields(testDocId, [
    {
      field_name: 'contract_value',
      field_value: '2500000',
      field_type: 'number',
      confidence: 0.98,
      is_missing: false,
      is_ambiguous: false,
      source_text: 'Value: ₹ 25,00,000',
      source_page: 1,
    },
  ]);

  const fields = await ServerPersistence.getExtractedFields(testDocId);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].field_value, '2500000');

  // Clean up
  await ServerPersistence.deleteDocument(testDocId);
  const afterDelete = await ServerPersistence.getDocumentById(testDocId);
  assert.equal(afterDelete, null);
});

test('Integration 4: Deterministic Fallback Text Extraction', async () => {
  const sampleInvoiceText = `
    METRO SUPPLIES PVT LTD
    TAX INVOICE
    Invoice Number: INV-9876
    Invoice Date: 2025-05-12
    Due Date: 2025-06-12
    PO Reference: PO-4545
    Subtotal: ₹ 10,000.00
    Tax: ₹ 1,800.00
    Total Amount: ₹ 11,800.00
    Currency: INR
  `;

  const extracted = await extractDocumentWithEvidence(
    Buffer.from(sampleInvoiceText, 'utf-8'),
    'text/plain',
    'invoice',
    sampleInvoiceText,
    'doc-test-inv-01'
  );

  assert.ok(extracted.fields.length > 0);
  const invNumber = extracted.fields.find((f) => f.field_name === 'invoice_number');
  const total = extracted.fields.find((f) => f.field_name === 'total');
  const currency = extracted.fields.find((f) => f.field_name === 'currency');

  assert.ok(invNumber, 'Invoice number must be extracted');
  assert.equal(invNumber.field_value, 'INV-9876');

  assert.ok(total, 'Total must be extracted');
  assert.equal(total.field_value, '11800');

  assert.ok(currency, 'Currency must be extracted');
  assert.equal(currency.field_value, 'INR');
});

test('Integration 5: Dashboard Stats Computation', async () => {
  const stats = await ServerPersistence.getDashboardStats();
  assert.ok(typeof stats.totalDocuments === 'number');
  assert.ok(typeof stats.openFindings === 'number');
  assert.ok(typeof stats.pendingReview === 'number');
  assert.ok(typeof stats.flaggedVariance === 'number');
  assert.ok(Array.isArray(stats.recentFindings));
});

test('Integration 6: Path Traversal Protection in getFileFromStorage', async () => {
  const { getFileFromStorage } = await import('../src/lib/server/fileStorage.ts');
  // Attempt to access parent paths outside .data/storage
  const traversalAttempt = await getFileFromStorage('../../package.json');
  assert.equal(traversalAttempt, null, 'Path traversal must be blocked and return null');

  const absoluteTraversal = await getFileFromStorage('C:\\Windows\\System32\\drivers\\etc\\hosts');
  assert.equal(absoluteTraversal, null, 'Arbitrary absolute system path access must be blocked');
});

test('Integration 7: Review Decision & History Preserved Across Reprocessing', async () => {
  const findingId = `f-test-review-${Date.now()}`;
  const docA = `doc-src-${Date.now()}`;
  const docB = `doc-cmp-${Date.now()}`;
  const initialFinding = {
    id: findingId,
    rule_id: 'RULE_INVOICE_EXCEEDS_PO',
    finding_type: 'exceeds_po_amount',
    severity: 'critical',
    status: 'open',
    title: 'Test Invoice Exceeds PO',
    description: 'Testing review preservation',
    reason: 'Testing',
    source_document_id: docA,
    compared_document_id: docB,
    source_value: '100000',
    compared_value: '80000',
    variance: 20000,
    financial_impact: 20000,
    currency: 'INR',
    calculation_method: 'Invoice Total - PO Total',
    source_field: 'total',
    compared_field: 'total',
    source_page: 1,
    source_text: '100000',
    compared_page: 1,
    compared_text: '80000',
    user_id: 'usr-demo-admin-001',
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    decision_history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await ServerPersistence.saveFindings([initialFinding]);

  // Submit human review
  const reviewed = await ServerPersistence.updateFindingReview(
    findingId,
    'resolved',
    'Variance remediated through credit memo CM-442.',
    'Senior Auditor'
  );
  assert.ok(reviewed);
  assert.equal(reviewed.status, 'resolved');
  assert.equal(reviewed.review_decision, 'resolved');
  assert.equal(reviewed.decision_history.length, 1);

  // Now simulate re-running reconciliation (reprocessing) with new calculated values
  const reprocessedFinding = {
    ...initialFinding,
    id: `F-NEW-RUN-ID`, // fresh ID generated by engine
    source_value: '100000',
    compared_value: '80000',
    variance: 20000,
    financial_impact: 20000,
  };

  // Save findings again
  await ServerPersistence.saveFindings([reprocessedFinding]);

  // Retrieve finding from database to verify review was not erased
  const persisted = await ServerPersistence.getFindingById(findingId);
  assert.ok(persisted, 'Finding must still exist under preserved ID');
  assert.equal(persisted.status, 'resolved', 'Status must remain resolved after reprocessing');
  assert.equal(persisted.review_decision, 'resolved');
  assert.equal(persisted.review_comments, 'Variance remediated through credit memo CM-442.');
  assert.equal(persisted.decision_history.length, 1);
});

test('Integration 8: Document and Finding Ownership Authorization Check', async () => {
  const allowed = await ServerPersistence.canUserAccessDocument('usr-demo-admin-001', 'doc-inv-01');
  assert.equal(allowed, true, 'Admin or demo user should have access');

  const findingAllowed = await ServerPersistence.canUserAccessFinding('usr-demo-admin-001', 'F-001');
  assert.equal(findingAllowed, true, 'Admin user can access finding');
});

test('Integration 9: Cross-User Access Denial (Strict Authorization)', async () => {
  // Create document owned by User A
  const userADocId = `doc-userA-${Date.now()}`;
  await ServerPersistence.createDocument({
    id: userADocId,
    user_id: 'usr-tenant-A',
    file_name: 'Confidential_A.pdf',
    file_path: '/uploads/a.pdf',
    file_size: 100,
    mime_type: 'application/pdf',
    category: 'invoice',
    classified_as: 'invoice',
    status: 'completed',
    page_count: 1,
    processing_started_at: new Date().toISOString(),
    processing_completed_at: new Date().toISOString(),
    processing_error: null,
    processing_attempts: 1,
    file_hash: `hash-A-${Date.now()}`,
  });

  // User A should have access
  const userAAccess = await ServerPersistence.canUserAccessDocument('usr-tenant-A', userADocId, 'user');
  assert.equal(userAAccess, true, 'Owner should have access');

  // User B attempting to access User A's document MUST be denied
  const userBAccess = await ServerPersistence.canUserAccessDocument('usr-tenant-B', userADocId, 'user');
  assert.equal(userBAccess, false, 'Cross-user access MUST be denied');

  // Unauthenticated access MUST be denied
  const anonAccess = await ServerPersistence.canUserAccessDocument(undefined, userADocId);
  assert.equal(anonAccess, false, 'Unauthenticated access MUST be denied');

  // Cleanup
  await ServerPersistence.deleteDocument(userADocId);
});

test('Integration 10: File Storage Cleanup on Document Deletion', async () => {
  const { saveFileToStorage, getFileFromStorage, deleteFileFromStorage } = await import('../src/lib/server/fileStorage.ts');
  const buffer = Buffer.from('test cleanup content', 'utf-8');
  const hash = 'hash-cleanup-test-' + Date.now();
  const filePath = await saveFileToStorage(buffer, hash, 'cleanup_test.pdf');

  // Verify file exists
  const stored = await getFileFromStorage(filePath);
  assert.ok(stored, 'File must exist after save');

  // Delete file
  const deleted = await deleteFileFromStorage(filePath);
  assert.equal(deleted, true, 'deleteFileFromStorage must return true');

  // Verify file is gone
  const afterDelete = await getFileFromStorage(filePath);
  assert.equal(afterDelete, null, 'File must be gone after delete');
});

test('Integration 11: Server Auth Module extracts and enforces trusted role', async () => {
  const { checkDocumentOwnership, checkFindingOwnership } = await import('../src/lib/server/auth.ts');

  const adminUser = { id: 'admin-01', email: 'admin@doc.ai', name: 'Admin', role: 'admin' };
  const userA = { id: 'usr-a', email: 'a@doc.ai', name: 'User A', role: 'user' };
  const userB = { id: 'usr-b', email: 'b@doc.ai', name: 'User B', role: 'user' };

  const docOfA = { id: 'doc-1', user_id: 'usr-a' };
  const findingOfA = { id: 'find-1', user_id: 'usr-a' };

  // Owner access
  assert.equal(checkDocumentOwnership(userA, docOfA), true);
  assert.equal(checkFindingOwnership(userA, findingOfA), true);

  // Admin access to all
  assert.equal(checkDocumentOwnership(adminUser, docOfA), true);
  assert.equal(checkFindingOwnership(adminUser, findingOfA), true);

  // Cross-user access denied
  assert.equal(checkDocumentOwnership(userB, docOfA), false);
  assert.equal(checkFindingOwnership(userB, findingOfA), false);
});
