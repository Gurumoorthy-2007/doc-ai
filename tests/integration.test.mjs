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
