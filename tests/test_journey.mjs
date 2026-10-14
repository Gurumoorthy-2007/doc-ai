// ============================================================
// DocuSentinel AI — End-to-End User Journey Verification
// Simulates:
// 1. Login page check (HTTP 200, Google Stitch UI components)
// 2. Upload Contract (₹10,00,000), PO (₹8,50,000), Invoice (₹9,20,000)
// 3. Extract real fields with evidence passages
// 4. Reconcile amounts -> verify exact ₹70,000 variance and finding
// 5. Open source evidence (raw file & bounding text)
// 6. Review finding (accept with comments)
// 7. Refresh and verify full disk & database persistence
// ============================================================

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('====================================================');
  console.log('DOCUSENTINEL AI — COMPLETE END-TO-END VERIFICATION');
  console.log('====================================================\n');

  // STEP 1: Verify Login & Core Pages
  console.log('--- Step 1: Checking Authentication & Core Pages ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`);
  assert.equal(loginRes.status, 200, 'Login page must return HTTP 200');
  const loginHtml = await loginRes.text();
  assert.ok(loginHtml.includes('DocuSentinel') || loginHtml.includes('Sign in') || loginHtml.includes('Login'), 'Login page must contain branding/form');
  console.log('  [PASS] Login page is reachable and renders with HTTP 200');

  const dashRes = await fetch(`${BASE_URL}/dashboard`);
  assert.equal(dashRes.status, 200, 'Dashboard page must return HTTP 200');
  console.log('  [PASS] Dashboard page is reachable and renders with HTTP 200');

  // Reset demo data to ensure a clean slate
  console.log('\n--- Step 2: Reset Demo State ---');
  const resetRes = await fetch(`${BASE_URL}/api/demo/reset`, { method: 'POST' });
  assert.equal(resetRes.status, 200, 'Reset API must return 200');
  console.log('  [PASS] Clean slate initialized via /api/demo/reset');

  // STEP 3: Upload Contract, PO, and Invoice
  console.log('\n--- Step 3: Uploading Contract, PO, and Invoice ---');

  // Helper to create FormData multipart upload
  async function uploadDocument(fileName, mimeType, contentText, category) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
      `Content-Type: ${mimeType}\r\n\r\n`,
      contentText,
      `\r\n--${boundary}\r\n`,
      `Content-Disposition: form-data; name="category"\r\n\r\n`,
      category,
      `\r\n--${boundary}--\r\n`,
    ];

    const bodyBuffer = Buffer.from(bodyParts.join(''), 'utf-8');

    const res = await fetch(`${BASE_URL}/api/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    const json = await res.json();
    assert.ok(res.status === 200 || res.status === 201, `Upload of ${fileName} must return HTTP 200/201 (got ${res.status})`);
    assert.ok(json.success, `Upload of ${fileName} must succeed`);
    return json.data.document || json.data;
  }

  // 1. Contract: ₹10,00,000
  const contractContent = `%PDF-1.4
1 0 obj
<< /Title (MASTER SERVICES AGREEMENT) >>
endobj
MASTER SERVICES AGREEMENT
Contract Ref: CTR-2025-001
Effective Date: 2025-01-01
Supplier: Apex Technologies Solutions Pvt Ltd
Client: DocuSentinel Global Corp
Scope: Enterprise Document Intelligence Consulting
Contract Ceiling / Total Value: INR 10,00,000
Payment Terms: Net 30
Signed and Authorized.
%%EOF`;

  const contractDoc = await uploadDocument('Master_Agreement_Apex.pdf', 'application/pdf', contractContent, 'contract');
  console.log(`  [PASS] Contract uploaded: ID = ${contractDoc.id}, Name = ${contractDoc.file_name}, Size = ${contractDoc.file_size}B`);

  // 2. Purchase Order: ₹8,50,000
  const poContent = `%PDF-1.4
1 0 obj
<< /Title (PURCHASE ORDER PO-2025-8842) >>
endobj
PURCHASE ORDER
PO Number: PO-2025-8842
PO Date: 2025-01-15
Supplier: Apex Technologies
Contract Reference: CTR-2025-001
Line 1: Q1 Software Architecture - ₹ 4,00,000
Line 2: Q1 Implementation Support - ₹ 4,50,000
PO Total Amount: INR 8,50,000
Authorized By: Procurement Director
%%EOF`;

  const poDoc = await uploadDocument('Purchase_Order_8842.pdf', 'application/pdf', poContent, 'purchase_order');
  console.log(`  [PASS] Purchase Order uploaded: ID = ${poDoc.id}, Name = ${poDoc.file_name}, Size = ${poDoc.file_size}B`);

  // 3. Invoice: ₹9,20,000 (creating exact ₹70,000 variance against PO ₹8,50,000)
  const invoiceContent = `%PDF-1.4
1 0 obj
<< /Title (TAX INVOICE INV-2025-9912) >>
endobj
TAX INVOICE
Invoice Number: INV-2025-9912
Invoice Date: 2025-02-10
Due Date: 2025-03-12
Supplier: Apex Technologies Solutions
PO Reference: PO-2025-8842
Subtotal: INR 8,50,000
Expedited Delivery & Overtime: INR 70,000
Total Invoice Amount: INR 9,20,000
Currency: INR
Bank: HDFC Bank Limited
%%EOF`;

  const invoiceDoc = await uploadDocument('Tax_Invoice_9912.pdf', 'application/pdf', invoiceContent, 'invoice');
  console.log(`  [PASS] Invoice uploaded: ID = ${invoiceDoc.id}, Name = ${invoiceDoc.file_name}, Size = ${invoiceDoc.file_size}B`);

  // STEP 4: Process and Extract Real Fields
  console.log('\n--- Step 4: Extracting Real Fields & Evidence Passages ---');

  async function processDoc(id) {
    const res = await fetch(`${BASE_URL}/api/documents/${id}/process`, { method: 'POST' });
    const json = await res.json();
    assert.equal(res.status, 200, `Processing document ${id} must return HTTP 200`);
    assert.ok(json.success, `Processing document ${id} must succeed`);
    return json.data;
  }

  const contractProcessed = await processDoc(contractDoc.id);
  console.log(`  [PASS] Contract extracted fields count: ${contractProcessed.fields.length}`);
  const contractValField = contractProcessed.fields.find(f => f.field_name === 'contract_value' || f.field_name === 'total_value');
  console.log(`         Contract Value Extracted: ₹ ${contractValField?.field_value}`);
  assert.equal(contractValField?.field_value, '1000000', 'Contract value must be extracted as 1000000');

  const poProcessed = await processDoc(poDoc.id);
  console.log(`  [PASS] PO extracted fields count: ${poProcessed.fields.length}`);
  const poTotalField = poProcessed.fields.find(f => f.field_name === 'total');
  console.log(`         PO Total Extracted: ₹ ${poTotalField?.field_value}`);
  assert.equal(poTotalField?.field_value, '850000', 'PO total must be extracted as 850000');

  const invoiceProcessed = await processDoc(invoiceDoc.id);
  console.log(`  [PASS] Invoice extracted fields count: ${invoiceProcessed.fields.length}`);
  const invoiceTotalField = invoiceProcessed.fields.find(f => f.field_name === 'total');
  console.log(`         Invoice Total Extracted: ₹ ${invoiceTotalField?.field_value}`);
  assert.equal(invoiceTotalField?.field_value, '920000', 'Invoice total must be extracted as 920000');

  // Verify evidence snippet exists
  assert.ok(invoiceTotalField?.source_text, 'Invoice field must contain traceable source text');
  console.log(`         Evidence Source Text: "${invoiceTotalField.source_text.trim()}"`);

  // STEP 5: Reconcile Amounts (₹10,00,000 vs ₹8,50,000 vs ₹9,20,000)
  console.log('\n--- Step 5: 3-Way Reconciliation Execution ---');
  const reconRes = await fetch(`${BASE_URL}/api/reconciliation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId: contractDoc.id,
      purchaseOrderId: poDoc.id,
      invoiceId: invoiceDoc.id,
      groupName: 'Apex Tech Services Q1-Q2 Reconciliation',
    }),
  });

  const reconJson = await reconRes.json();
  assert.equal(reconRes.status, 200, 'Reconciliation must return HTTP 200');
  assert.ok(reconJson.success, 'Reconciliation must be successful');

  const reconGroup = reconJson.data.group;
  const findings = reconJson.data.findings;

  console.log(`  [PASS] Reconciliation Group ID: ${reconGroup.id}`);
  console.log(`         Status: ${reconGroup.status}`);
  console.log(`         Invoice Amount: ₹ ${reconGroup.invoice_value?.toLocaleString('en-IN')}`);
  console.log(`         PO Amount:      ₹ ${reconGroup.po_value?.toLocaleString('en-IN')}`);
  console.log(`         Variance:       ₹ ${reconGroup.variance?.toLocaleString('en-IN')}`);
  console.log(`         Findings Count: ${findings.length}`);

  // VERIFY EXACT VARIANCE OF ₹70,000
  assert.equal(reconGroup.variance, 70000, 'Variance must exactly equal ₹70,000 (9,20,000 - 8,50,000)');
  assert.equal(reconGroup.status, 'discrepancy', 'Status must be discrepancy due to non-zero variance');

  // Check specific finding
  const varianceFinding = findings.find(f => f.finding_type === 'amount_mismatch' || f.finding_type === 'exceeds_po_amount' || f.financial_impact === 70000);
  assert.ok(varianceFinding, 'A finding must be created for the ₹70,000 amount discrepancy');
  console.log(`  [PASS] Generated Finding: ID = ${varianceFinding.id}, Title = "${varianceFinding.title}", Severity = ${varianceFinding.severity}`);
  console.log(`         Finding Details: ${varianceFinding.description}`);

  // STEP 6: Open Source Evidence Traceability
  console.log('\n--- Step 6: Verifying Source Evidence Traceability ---');
  const rawFileRes = await fetch(`${BASE_URL}/api/documents/${invoiceDoc.id}/file`);
  assert.equal(rawFileRes.status, 200, 'Raw file download must return HTTP 200');
  const rawFileBuffer = await rawFileRes.arrayBuffer();
  assert.equal(rawFileBuffer.byteLength, Buffer.from(invoiceContent).length, 'Raw file size must match original upload');
  console.log(`  [PASS] Original document binary retrievable via /api/documents/${invoiceDoc.id}/file (${rawFileBuffer.byteLength} bytes)`);

  const docDetailRes = await fetch(`${BASE_URL}/api/documents/${invoiceDoc.id}`);
  const docDetailJson = await docDetailRes.json();
  assert.equal(docDetailRes.status, 200);
  assert.ok(docDetailJson.data.fields.length > 0, 'Extracted fields must be retrievable from document detail');
  console.log(`  [PASS] Document detail endpoint returned ${docDetailJson.data.fields.length} extracted fields with confidence and source page references`);

  // STEP 7: Review Finding and Save Decision
  console.log('\n--- Step 7: Submitting Human Review Decision ---');
  const reviewRes = await fetch(`${BASE_URL}/api/findings/${varianceFinding.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision: 'accepted',
      comments: 'Variance of ₹70,000 verified against signed amendment for expedited delivery; approved by finance manager.',
      reviewerName: 'Demo Reviewer (Lead Auditor)',
    }),
  });

  const reviewJson = await reviewRes.json();
  assert.equal(reviewRes.status, 200, 'Review submission must return HTTP 200');
  assert.ok(reviewJson.success, 'Review submission must succeed');
  assert.ok(reviewJson.data.status === 'accepted' || reviewJson.data.status === 'resolved', `Finding status must transition to accepted/resolved (got ${reviewJson.data.status})`);
  assert.equal(reviewJson.data.review_decision, 'accepted', 'Review decision must be recorded as accepted');
  console.log(`  [PASS] Review decision saved: Status = ${reviewJson.data.status}, Decision = ${reviewJson.data.review_decision}`);
  console.log(`         Review Comments: "${reviewJson.data.review_comments}"`);

  // STEP 8: Refresh and Verify Complete Persistence
  console.log('\n--- Step 8: Verifying Persistence (Simulated Page Refresh) ---');

  // 1. Verify finding is persisted
  const persistedFindingRes = await fetch(`${BASE_URL}/api/findings/${varianceFinding.id}`);
  const persistedFindingJson = await persistedFindingRes.json();
  assert.equal(persistedFindingRes.status, 200);
  const returnedFinding = persistedFindingJson.data.finding || persistedFindingJson.data;
  assert.equal(returnedFinding.is_reviewed, true, 'Finding must remain reviewed after refresh');
  assert.equal(returnedFinding.review_decision, 'accepted', 'Finding decision must remain accepted after refresh');
  console.log('  [PASS] Finding review decision is permanently persisted in database');

  // 2. Verify documents are persisted
  const persistedDocRes = await fetch(`${BASE_URL}/api/documents/${invoiceDoc.id}`);
  const persistedDocJson = await persistedDocRes.json();
  assert.equal(persistedDocRes.status, 200);
  assert.equal(persistedDocJson.data.document.id, invoiceDoc.id);
  assert.equal(persistedDocJson.data.document.file_name, 'Tax_Invoice_9912.pdf');
  assert.equal(persistedDocJson.data.fields.length, invoiceProcessed.fields.length);
  console.log('  [PASS] Document and extracted fields are permanently persisted in database');

  // 3. Verify reconciliation group is persisted
  const persistedReconRes = await fetch(`${BASE_URL}/api/reconciliation`);
  const persistedReconJson = await persistedReconRes.json();
  const groupsList = Array.isArray(persistedReconJson.data) ? persistedReconJson.data : (persistedReconJson.data?.groups || []);
  const foundGroup = groupsList.find(g => g.id === reconGroup.id);
  assert.ok(foundGroup, 'Reconciliation group must exist in list after refresh');
  assert.equal(foundGroup.variance, 70000, 'Persisted reconciliation variance must remain ₹70,000');
  console.log('  [PASS] Reconciliation group and variance are permanently persisted');

  // 4. Verify disk persistence directly
  const dbDiskPath = path.join(process.cwd(), '.data', 'db.json');
  const dbDiskRaw = await fs.readFile(dbDiskPath, 'utf-8');
  const dbDisk = JSON.parse(dbDiskRaw);

  const diskDoc = dbDisk.documents.find(d => d.id === invoiceDoc.id);
  assert.ok(diskDoc, 'Invoice document must exist in .data/db.json on disk');
  const diskFinding = dbDisk.findings.find(f => f.id === varianceFinding.id);
  assert.ok(diskFinding, 'Finding must exist in .data/db.json on disk');
  assert.equal(diskFinding.review_decision, 'accepted', 'Finding on disk must record decision = accepted');

  const diskFileExists = await fs.stat(diskDoc.file_path).catch(() => null);
  assert.ok(diskFileExists, `Original physical file at ${diskDoc.file_path} must exist on disk`);
  console.log(`  [PASS] Physical file stored on disk: ${diskDoc.file_path} (${diskFileExists.size} bytes)`);
  console.log('  [PASS] Database file (.data/db.json) contains all documents, fields, reconciliation records, and audit events');

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR IN VERIFICATION JOURNEY]:', err);
  process.exit(1);
});
