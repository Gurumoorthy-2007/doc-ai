// ============================================================
// DocuSentinel AI — Content-Based Document Classification Tests
// Verifies NLP heuristics, word-boundary enforcement, no silent defaults to invoice,
// and rejection of substring false positives (e.g., 'report' matching 'po').
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocumentContent } from '../src/lib/server/classification.ts';

test('Classification 1: Correctly identifies Invoice content with high confidence', () => {
  const invoiceText = `TAX INVOICE
Acme Global Solutions Pvt Ltd
Invoice Number: INV-2026-9001
Invoice Date: 2026-04-15
Bill To: Globex Corporation
Subtotal: $10,000.00
GST (18%): $1,800.00
Total Amount Due: $11,800.00
Bank Transfer: HDFC0001234
Payment Due: Net 30 Days`;

  const result = classifyDocumentContent(invoiceText, 'doc_scan.pdf');
  assert.equal(result.category, 'invoice');
  assert.ok(result.confidence >= 0.80);
  assert.equal(result.requiresConfirmation, false);
});

test('Classification 2: Correctly identifies Purchase Order content with high confidence', () => {
  const poText = `PURCHASE ORDER
Purchase Order Number: PO-88990
Order Date: 2026-03-20
Buyer: TechCorp Procurement Services
Deliver To: Building 4, Cyber City
Vendor: Acme Global Solutions Pvt Ltd
Item: Cloud Infrastructure Setup - Qty: 1 - Price: $25,000.00
Authorized Purchaser: Director of Engineering`;

  const result = classifyDocumentContent(poText, 'order_doc.pdf');
  assert.equal(result.category, 'purchase_order');
  assert.ok(result.confidence >= 0.80);
  assert.equal(result.requiresConfirmation, false);
});

test('Classification 3: Negative Control — "report" does NOT match Purchase Order', () => {
  const reportText = `Quarterly Performance Report - Q1 2026
Executive Summary:
Our portfolio showed steady progress in regional sales opportunities.
Transport costs stabilized throughout the reporting period.
No purchase orders or invoices are contained in this summary.`;

  const result = classifyDocumentContent(reportText, 'Q1_Financial_Report.pdf');
  assert.notEqual(result.category, 'purchase_order', 'Reports must NEVER be classified as Purchase Orders');
  assert.notEqual(result.category, 'invoice', 'Reports must NEVER silently default to Invoices');
  assert.equal(result.category, 'other');
});

test('Classification 4: Correctly identifies Contract / Master Services Agreement', () => {
  const contractText = `MASTER SERVICES AGREEMENT
This Agreement is entered into on this 1st day of January 2026, by and between:
Client: Enterprise Global Ltd
Provider: Apex Consulting Corp
Whereas Provider agrees to perform services according to Statements of Work (SOW);
Term and Termination: Either party may terminate with 30 days notice.
Indemnification and Governing Law: State of New York.`;

  const result = classifyDocumentContent(contractText, 'MSA_Apex_2026.pdf');
  assert.equal(result.category, 'contract');
  assert.ok(result.confidence >= 0.80);
  assert.equal(result.requiresConfirmation, false);
});

test('Classification 5: Correctly identifies Official Receipt', () => {
  const receiptText = `OFFICIAL PAYMENT RECEIPT
Receipt Number: RCPT-44021
Received From: TechCorp Ltd
Amount Received: INR 50,000.00
Paid In Full - Mode of Payment: Wire Transfer
Thank you for your business.`;

  const result = classifyDocumentContent(receiptText, 'payment_slip.pdf');
  assert.equal(result.category, 'receipt');
  assert.ok(result.confidence >= 0.70);
});

test('Classification 6: Correctly identifies Bank / Account Statement', () => {
  const statementText = `MONTHLY ACCOUNT STATEMENT
Statement of Account for Period: 01-Jan-2026 to 31-Jan-2026
Account Number: 9876543210
Opening Balance: $14,200.00
Total Deposits: $30,000.00
Total Withdrawals: $12,500.00
Closing Balance: $31,700.00`;

  const result = classifyDocumentContent(statementText, 'jan_statement.pdf');
  assert.equal(result.category, 'statement');
  assert.ok(result.confidence >= 0.70);
});

test('Classification 7: Correctly identifies Compliance Certificate', () => {
  const complianceText = `CERTIFICATE OF COMPLIANCE
ISO 27001:2022 Information Security Management System
This is to certify that Apex Cloud Infrastructure complies with standard audit controls.
Attestation of Compliance - Surveillance Audit Report`;

  const result = classifyDocumentContent(complianceText, 'iso_cert.pdf');
  assert.equal(result.category, 'compliance');
  assert.ok(result.confidence >= 0.70);
});

test('Classification 8: Unrecognized or empty text returns "other" and requires confirmation', () => {
  // Random notes without financial structure
  const genericText = `Meeting notes from team standup on Tuesday morning.
Discussed frontend components and design layout for the navigation bar.`;

  const result = classifyDocumentContent(genericText, 'notes.txt');
  assert.equal(result.category, 'other');
  assert.equal(result.requiresConfirmation, true, 'Unrecognized content must flag requiresConfirmation: true');
  assert.notEqual(result.category, 'invoice', 'Must NOT silently default to invoice');

  // Empty string
  const emptyResult = classifyDocumentContent('', 'blank.pdf');
  assert.equal(emptyResult.category, 'other');
  assert.equal(emptyResult.requiresConfirmation, true);
});

test('Classification 9: Resolves Invoice that references PO Number to Invoice', () => {
  const invoiceWithPoRef = `TAX INVOICE
Acme Supplies Ltd
Invoice #INV-2026-778
Date: 2026-05-10
Bill To: MegaCorp India
PO Reference Number: PO-9900
Total Amount Due: Rs. 1,45,000.00
Payment Due within 30 days`;

  const result = classifyDocumentContent(invoiceWithPoRef, 'INV-2026-778.pdf');
  // Header is clearly Tax Invoice and Bill To, even though body mentions PO Reference
  assert.equal(result.category, 'invoice');
  assert.ok(result.confidence >= 0.75);
});
