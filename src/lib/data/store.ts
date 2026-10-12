'use client';

// ============================================================
// DocuSentinel AI — Client-Side Unified Data Store & Persistence
// Handles offline/local caching + seamless Supabase sync
// ============================================================

import type {
  Document,
  ExtractedField,
  LineItem,
  ReconciliationGroup,
  Finding,
  FindingStatus,
  FindingSeverity,
  DocumentCategory,
  DocumentStatus,
  ReconciliationStatus,
} from '@/lib/types';
import { reconcileDocuments } from '@/lib/reconciliation/engine';

export interface AuditEvent {
  id: string;
  user_name: string;
  user_email: string;
  action: string;
  entity_type: 'document' | 'finding' | 'reconciliation' | 'user' | 'case';
  entity_id: string;
  entity_title: string;
  details: string;
  created_at: string;
}

export interface CaseHistoryItem {
  id: string;
  name: string;
  documents_count: number;
  findings_count: number;
  status: 'Open' | 'In Review' | 'Resolved' | 'Archived';
  last_updated: string;
}

// ------------------------------------------------------------
// Initial Seed Data (Matches Approved UI Design Screenshots)
// ------------------------------------------------------------

export const INITIAL_DOCUMENTS: Document[] = [
  {
    id: 'doc-inv-4827',
    user_id: 'usr-demo-admin-001',
    file_name: 'Invoice_4827.pdf',
    file_path: '/uploads/Invoice_4827.pdf',
    file_size: 2411724, // 2.3 MB
    mime_type: 'application/pdf',
    category: 'invoice',
    classified_as: 'invoice',
    status: 'completed',
    page_count: 2,
    processing_started_at: '2025-04-26T14:30:00Z',
    processing_completed_at: '2025-04-26T14:32:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-inv-4827',
    created_at: '2025-04-26T14:28:00Z',
    updated_at: '2025-04-26T14:32:00Z',
  },
  {
    id: 'doc-po-12456',
    user_id: 'usr-demo-admin-001',
    file_name: 'PO_12456.pdf',
    file_path: '/uploads/PO_12456.pdf',
    file_size: 1887436, // 1.8 MB
    mime_type: 'application/pdf',
    category: 'purchase_order',
    classified_as: 'purchase_order',
    status: 'completed',
    page_count: 3,
    processing_started_at: '2025-04-26T10:18:00Z',
    processing_completed_at: '2025-04-26T10:20:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-po-12456',
    created_at: '2025-04-26T10:15:00Z',
    updated_at: '2025-04-26T10:20:00Z',
  },
  {
    id: 'doc-contract-abc',
    user_id: 'usr-demo-admin-001',
    file_name: 'Contract_Agreement.pdf',
    file_path: '/uploads/Contract_Agreement.pdf',
    file_size: 3565158, // 3.4 MB
    mime_type: 'application/pdf',
    category: 'contract',
    classified_as: 'contract',
    status: 'completed',
    page_count: 8,
    processing_started_at: '2025-04-26T09:40:00Z',
    processing_completed_at: '2025-04-26T09:44:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-contract-abc',
    created_at: '2025-04-26T09:35:00Z',
    updated_at: '2025-04-26T09:44:00Z',
  },
  {
    id: 'doc-inv-5112',
    user_id: 'usr-demo-admin-001',
    file_name: 'INV-5112.pdf',
    file_path: '/uploads/INV-5112.pdf',
    file_size: 2202009, // 2.1 MB
    mime_type: 'application/pdf',
    category: 'invoice',
    classified_as: 'invoice',
    status: 'completed',
    page_count: 5,
    processing_started_at: '2025-04-26T11:00:00Z',
    processing_completed_at: '2025-04-26T11:02:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-inv-5112',
    created_at: '2025-04-26T10:55:00Z',
    updated_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'doc-po-13001',
    user_id: 'usr-demo-admin-001',
    file_name: 'PO-13001.pdf',
    file_path: '/uploads/PO-13001.pdf',
    file_size: 1572864, // 1.5 MB
    mime_type: 'application/pdf',
    category: 'purchase_order',
    classified_as: 'purchase_order',
    status: 'completed',
    page_count: 2,
    processing_started_at: '2025-04-26T10:40:00Z',
    processing_completed_at: '2025-04-26T10:42:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-po-13001',
    created_at: '2025-04-26T10:35:00Z',
    updated_at: '2025-04-26T10:42:00Z',
  },
  {
    id: 'doc-inv-5031',
    user_id: 'usr-demo-admin-001',
    file_name: 'INV-5031.pdf',
    file_path: '/uploads/INV-5031.pdf',
    file_size: 1782579,
    mime_type: 'application/pdf',
    category: 'invoice',
    classified_as: 'invoice',
    status: 'completed',
    page_count: 2,
    processing_started_at: '2025-04-25T16:10:00Z',
    processing_completed_at: '2025-04-25T16:12:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-inv-5031',
    created_at: '2025-04-25T16:05:00Z',
    updated_at: '2025-04-25T16:12:00Z',
  },
  {
    id: 'doc-inv-5144',
    user_id: 'usr-demo-admin-001',
    file_name: 'INV-5144.pdf',
    file_path: '/uploads/INV-5144.pdf',
    file_size: 1468006,
    mime_type: 'application/pdf',
    category: 'invoice',
    classified_as: 'invoice',
    status: 'completed',
    page_count: 2,
    processing_started_at: '2025-04-25T14:00:00Z',
    processing_completed_at: '2025-04-25T14:02:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-inv-5144',
    created_at: '2025-04-25T13:50:00Z',
    updated_at: '2025-04-25T14:02:00Z',
  },
  {
    id: 'doc-receipt-778',
    user_id: 'usr-demo-admin-001',
    file_name: 'Receipt_778.jpg',
    file_path: '/uploads/Receipt_778.jpg',
    file_size: 943718, // 0.9 MB
    mime_type: 'image/jpeg',
    category: 'receipt',
    classified_as: 'receipt',
    status: 'completed',
    page_count: 1,
    processing_started_at: '2025-04-25T12:00:00Z',
    processing_completed_at: '2025-04-25T12:01:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-receipt-778',
    created_at: '2025-04-25T11:50:00Z',
    updated_at: '2025-04-25T12:01:00Z',
  },
  {
    id: 'doc-statement-may',
    user_id: 'usr-demo-admin-001',
    file_name: 'Statement_May.xlsx',
    file_path: '/uploads/Statement_May.xlsx',
    file_size: 1258291, // 1.2 MB
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: 'statement',
    classified_as: 'statement',
    status: 'completed',
    page_count: 1,
    processing_started_at: '2025-04-24T09:00:00Z',
    processing_completed_at: '2025-04-24T09:02:00Z',
    processing_error: null,
    processing_attempts: 1,
    file_hash: 'hash-statement-may',
    created_at: '2025-04-24T08:50:00Z',
    updated_at: '2025-04-24T09:02:00Z',
  },
];

export const INITIAL_EXTRACTED_FIELDS: ExtractedField[] = [
  // INV-5112.pdf
  {
    id: 'fld-5112-1',
    document_id: 'doc-inv-5112',
    field_name: 'invoice_number',
    field_value: 'INV-5112',
    field_type: 'string',
    confidence: 0.99,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Invoice No: INV-5112',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'fld-5112-2',
    document_id: 'doc-inv-5112',
    field_name: 'supplier_name',
    field_value: 'Metro Supplies',
    field_type: 'string',
    confidence: 0.98,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Metro Supplies Pvt Ltd',
    source_page: 1,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'fld-5112-3',
    document_id: 'doc-inv-5112',
    field_name: 'invoice_date',
    field_value: '2025-04-18',
    field_type: 'date',
    confidence: 0.97,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Date: Apr 18, 2025',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'fld-5112-4',
    document_id: 'doc-inv-5112',
    field_name: 'total_amount',
    field_value: '68750.00',
    field_type: 'number',
    confidence: 0.99,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Total Amount ₹ 68,750.00',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'fld-5112-5',
    document_id: 'doc-inv-5112',
    field_name: 'cost_center',
    field_value: 'CC-204',
    field_type: 'string',
    confidence: 0.94,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Cost Center: CC-204',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'fld-5112-6',
    document_id: 'doc-inv-5112',
    field_name: 'purchase_order_number',
    field_value: 'PO-13001',
    field_type: 'string',
    confidence: 0.96,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'PO Ref: PO-13001',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  // PO-13001.pdf
  {
    id: 'fld-13001-1',
    document_id: 'doc-po-13001',
    field_name: 'po_number',
    field_value: 'PO-13001',
    field_type: 'string',
    confidence: 0.99,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Purchase Order # PO-13001',
    source_page: 1,
    created_at: '2025-04-26T10:42:00Z',
  },
  {
    id: 'fld-13001-2',
    document_id: 'doc-po-13001',
    field_name: 'total_amount',
    field_value: '88500.00',
    field_type: 'number',
    confidence: 0.98,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Total Expected Amount: ₹ 88,500.00 (Base ₹ 75,000 + 18% Tax)',
    source_page: 1,
    created_at: '2025-04-26T10:42:00Z',
  },
  {
    id: 'fld-13001-3',
    document_id: 'doc-po-13001',
    field_name: 'cost_center',
    field_value: 'CC-203',
    field_type: 'string',
    confidence: 0.95,
    is_missing: false,
    is_ambiguous: false,
    source_text: 'Authorized Cost Center: CC-203',
    source_page: 1,
    created_at: '2025-04-26T10:42:00Z',
  },
];

export const INITIAL_LINE_ITEMS: LineItem[] = [
  {
    id: 'li-5112-1',
    document_id: 'doc-inv-5112',
    item_number: 1,
    description: 'Office Chairs - Ergonomic Executive Mesh',
    quantity: 10,
    unit_price: 6500.00,
    amount: 65000.00,
    unit: 'pcs',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
  {
    id: 'li-5112-2',
    document_id: 'doc-inv-5112',
    item_number: 2,
    description: 'GST (18%) & Freight Surcharge',
    quantity: 1,
    unit_price: 3750.00,
    amount: 3750.00,
    unit: 'unit',
    source_page: 2,
    created_at: '2025-04-26T11:02:00Z',
  },
];

export const INITIAL_RECONCILIATION_GROUPS: ReconciliationGroup[] = [
  {
    id: 'rec-grp-001',
    user_id: 'usr-demo-admin-001',
    name: 'ABC Corp - IT Services',
    contract_id: 'doc-contract-abc',
    purchase_order_id: 'doc-po-12456',
    invoice_id: 'doc-inv-4827',
    status: 'discrepancy',
    contract_value: 1000000, // ₹ 10,00,000
    po_value: 850000,        // ₹ 8,50,000
    invoice_value: 920000,   // ₹ 9,20,000
    variance: 70000,         // ₹ 70,000
    variance_percentage: 8.24,
    currency: 'INR',
    vendor_name: 'ABC Corp',
    reconciled_at: '2025-04-26T14:32:00Z',
    created_at: '2025-04-26T14:30:00Z',
    updated_at: '2025-04-26T14:32:00Z',
  },
  {
    id: 'rec-grp-002',
    user_id: 'usr-demo-admin-001',
    name: 'Global Solutions - Hardware',
    contract_id: null,
    purchase_order_id: 'doc-po-12456',
    invoice_id: 'doc-inv-5031',
    status: 'matched',
    contract_value: 500000,
    po_value: 500000,
    invoice_value: 500000,
    variance: 0,
    variance_percentage: 0,
    currency: 'INR',
    vendor_name: 'Global Solutions',
    reconciled_at: '2025-04-25T16:15:00Z',
    created_at: '2025-04-25T16:10:00Z',
    updated_at: '2025-04-25T16:15:00Z',
  },
  {
    id: 'rec-grp-003',
    user_id: 'usr-demo-admin-001',
    name: 'TechPro - Software',
    contract_id: null,
    purchase_order_id: null,
    invoice_id: null,
    status: 'matched',
    contract_value: 750000,
    po_value: 700000,
    invoice_value: 700000,
    variance: 0,
    variance_percentage: 0,
    currency: 'INR',
    vendor_name: 'TechPro Solutions',
    reconciled_at: '2025-04-25T15:00:00Z',
    created_at: '2025-04-25T14:50:00Z',
    updated_at: '2025-04-25T15:00:00Z',
  },
  {
    id: 'rec-grp-004',
    user_id: 'usr-demo-admin-001',
    name: 'NextGen - Services',
    contract_id: null,
    purchase_order_id: null,
    invoice_id: null,
    status: 'matched',
    contract_value: 1200000,
    po_value: 1150000,
    invoice_value: 1150000,
    variance: 0,
    variance_percentage: 0,
    currency: 'INR',
    vendor_name: 'NextGen Services',
    reconciled_at: '2025-04-25T11:20:00Z',
    created_at: '2025-04-25T11:00:00Z',
    updated_at: '2025-04-25T11:20:00Z',
  },
  {
    id: 'rec-grp-005',
    user_id: 'usr-demo-admin-001',
    name: 'Metro Supplies - Office Supplies',
    contract_id: null,
    purchase_order_id: 'doc-po-13001',
    invoice_id: 'doc-inv-5112',
    status: 'discrepancy',
    contract_value: null,
    po_value: 88500,
    invoice_value: 68750,
    variance: 19750,
    variance_percentage: 22.3,
    currency: 'INR',
    vendor_name: 'Metro Supplies',
    reconciled_at: '2025-04-26T11:05:00Z',
    created_at: '2025-04-26T11:00:00Z',
    updated_at: '2025-04-26T11:05:00Z',
  },
  {
    id: 'rec-grp-006',
    user_id: 'usr-demo-admin-001',
    name: 'Omni Logistics - Freight',
    contract_id: null,
    purchase_order_id: null,
    invoice_id: 'doc-inv-5144',
    status: 'missing_po',
    contract_value: null,
    po_value: null,
    invoice_value: 43200,
    variance: 43200,
    variance_percentage: null,
    currency: 'INR',
    vendor_name: 'Omni Logistics',
    reconciled_at: '2025-04-25T14:10:00Z',
    created_at: '2025-04-25T14:05:00Z',
    updated_at: '2025-04-25T14:10:00Z',
  },
];

export const INITIAL_FINDINGS: Finding[] = [
  {
    id: 'F-001',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-001',
    finding_type: 'exceeds_po_amount',
    severity: 'high',
    status: 'open',
    title: 'Invoice exceeds PO amount',
    description: 'The invoice amount (₹ 9,20,000) exceeds the approved purchase order amount (₹ 8,50,000) by ₹ 70,000.',
    reason: 'Invoice amount of ₹ 9,20,000 exceeds approved PO-12456 amount of ₹ 8,50,000 by ₹ 70,000 (8.2% variance).',
    source_document_id: 'doc-inv-4827',
    compared_document_id: 'doc-po-12456',
    source_value: '920000',
    compared_value: '850000',
    financial_impact: 70000,
    currency: 'INR',
    source_field: 'total_amount',
    source_page: 1,
    source_text: 'Invoice Total: ₹ 9,20,000.00',
    compared_field: 'total_amount',
    compared_page: 2,
    compared_text: 'Approved PO Value: ₹ 8,50,000.00',
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-26T14:32:00Z',
    updated_at: '2025-04-26T14:32:00Z',
  },
  {
    id: 'F-002',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-001',
    finding_type: 'missing_field',
    severity: 'medium',
    status: 'open',
    title: 'Missing compliance document',
    description: 'Vendor compliance attachment certification is missing for Contract #ABC.',
    reason: 'Section 4.2 of Contract_Agreement.pdf mandates annual ISO compliance certification prior to billing.',
    source_document_id: 'doc-contract-abc',
    compared_document_id: null,
    source_value: null,
    compared_value: null,
    financial_impact: null,
    currency: 'INR',
    source_field: 'compliance_annexure',
    source_page: 4,
    source_text: 'Supplier shall submit ISO 27001 certificate prior to invoicing',
    compared_field: null,
    compared_page: null,
    compared_text: null,
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-26T11:10:00Z',
    updated_at: '2025-04-26T11:10:00Z',
  },
  {
    id: 'F-003',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-001',
    finding_type: 'supplier_mismatch',
    severity: 'medium',
    status: 'open',
    title: 'Supplier mismatch',
    description: 'PO #12345 vendor entity name variation detected against master contract register.',
    reason: 'Vendor registered as "ABC Tech India LLP" on invoice vs "ABC Corp" on Contract.',
    source_document_id: 'doc-inv-4827',
    compared_document_id: 'doc-contract-abc',
    source_value: 'ABC Tech India LLP',
    compared_value: 'ABC Corp',
    financial_impact: 25000,
    currency: 'INR',
    source_field: 'supplier_name',
    source_page: 1,
    source_text: 'Billed by: ABC Tech India LLP',
    compared_field: 'parties',
    compared_page: 1,
    compared_text: 'Contract between Client & ABC Corp',
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-25T15:20:00Z',
    updated_at: '2025-04-25T15:20:00Z',
  },
  {
    id: 'F-004',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-001',
    finding_type: 'payment_term_mismatch',
    severity: 'low',
    status: 'resolved',
    title: 'Payment term deviation',
    description: 'Invoice payment terms specified as Net 15 instead of agreed Contract Net 30 days.',
    reason: 'Invoice specifies "Payment due within 15 days", whereas Contract #ABC Section 7 mandates Net 30.',
    source_document_id: 'doc-inv-4827',
    compared_document_id: 'doc-contract-abc',
    source_value: 'Net 15 Days',
    compared_value: 'Net 30 Days',
    financial_impact: 15000,
    currency: 'INR',
    source_field: 'payment_terms',
    source_page: 2,
    source_text: 'Payment Terms: 15 Days from Invoice Date',
    compared_field: 'payment_terms',
    compared_page: 5,
    compared_text: 'Invoices payable within 30 calendar days of verification',
    is_reviewed: true,
    reviewed_by: 'usr-demo-admin-001',
    reviewed_at: '2025-04-25T18:00:00Z',
    review_decision: 'accepted',
    review_comments: 'Notified accounts payable to schedule payment according to master contract Net 30 terms.',
    created_at: '2025-04-24T10:00:00Z',
    updated_at: '2025-04-25T18:00:00Z',
  },
  {
    id: 'F-005',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-005',
    finding_type: 'amount_mismatch',
    severity: 'high',
    status: 'open',
    title: 'Invoice amount mismatch (Cost center & underbill)',
    description: 'The invoice amount does not match the amount in the purchase order and cost center is inconsistent.',
    reason: 'Invoice INV-5112 total ₹ 68,750 vs PO expected ₹ 88,500. Cost center CC-204 vs PO authorized CC-203.',
    source_document_id: 'doc-inv-5112',
    compared_document_id: 'doc-po-13001',
    source_value: '68750',
    compared_value: '88500',
    financial_impact: 19750,
    currency: 'INR',
    source_field: 'total_amount',
    source_page: 2,
    source_text: 'Total Amount ₹ 68,750.00',
    compared_field: 'total_amount',
    compared_page: 1,
    compared_text: 'Total Expected Amount: ₹ 88,500.00',
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-26T11:05:00Z',
    updated_at: '2025-04-26T11:05:00Z',
  },
  {
    id: 'F-006',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-006',
    finding_type: 'missing_field',
    severity: 'medium',
    status: 'open',
    title: 'Missing PO number',
    description: 'Invoice INV-5144 from Omni Logistics has no purchase order reference number.',
    reason: 'No PO reference provided on invoice document; unable to automatically tie to approved budget.',
    source_document_id: 'doc-inv-5144',
    compared_document_id: null,
    source_value: null,
    compared_value: null,
    financial_impact: 43200,
    currency: 'INR',
    source_field: 'purchase_order_number',
    source_page: 1,
    source_text: 'PO Ref: [None Specified]',
    compared_field: null,
    compared_page: null,
    compared_text: null,
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-25T14:10:00Z',
    updated_at: '2025-04-25T14:10:00Z',
  },
  {
    id: 'F-007',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-002',
    finding_type: 'tax_discrepancy',
    severity: 'medium',
    status: 'reviewing',
    title: 'Tax calculation variance',
    description: 'Tax computation deviates from statutory 18% GST rate on INV-5031 line items.',
    reason: 'Calculated tax ₹ 9,414 vs document stated ₹ 9,200 (₹ 214 variance).',
    source_document_id: 'doc-inv-5031',
    compared_document_id: null,
    source_value: '9200',
    compared_value: '9414',
    financial_impact: 214,
    currency: 'INR',
    source_field: 'tax_amount',
    source_page: 1,
    source_text: 'GST 18%: ₹ 9,200.00',
    compared_field: null,
    compared_page: null,
    compared_text: null,
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-24T16:00:00Z',
    updated_at: '2025-04-24T16:00:00Z',
  },
  {
    id: 'F-008',
    user_id: 'usr-demo-admin-001',
    reconciliation_group_id: 'rec-grp-001',
    finding_type: 'duplicate_invoice',
    severity: 'high',
    status: 'open',
    title: 'Duplicate invoice detected',
    description: 'Identical invoice number INV-4827 submitted across multiple billing batches.',
    reason: 'Invoice number INV-4827 appears in both April batch and March closing draft.',
    source_document_id: 'doc-inv-4827',
    compared_document_id: null,
    source_value: 'INV-4827',
    compared_value: 'INV-4827',
    financial_impact: 87500,
    currency: 'INR',
    source_field: 'invoice_number',
    source_page: 1,
    source_text: 'Invoice # INV-4827',
    compared_field: null,
    compared_page: null,
    compared_text: null,
    is_reviewed: false,
    reviewed_by: null,
    reviewed_at: null,
    review_decision: null,
    review_comments: null,
    created_at: '2025-04-25T19:57:00Z',
    updated_at: '2025-04-25T19:57:00Z',
  },
];

export const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'aud-001',
    user_name: 'Gurumoorthy S',
    user_email: 'gurumoorthy@docusentinel.ai',
    action: 'Document Uploaded',
    entity_type: 'document',
    entity_id: 'doc-inv-4827',
    entity_title: 'Invoice_4827.pdf',
    details: 'Uploaded invoice document (2.3 MB) into workspace.',
    created_at: '2025-04-26T14:28:00Z',
  },
  {
    id: 'aud-002',
    user_name: 'System (AI Engine)',
    user_email: 'system@docusentinel.ai',
    action: 'AI Extraction Completed',
    entity_type: 'document',
    entity_id: 'doc-inv-4827',
    entity_title: 'Invoice_4827.pdf',
    details: 'Extracted 14 structured fields with 98.4% mean confidence.',
    created_at: '2025-04-26T14:32:00Z',
  },
  {
    id: 'aud-003',
    user_name: 'System (Reconciliation)',
    user_email: 'system@docusentinel.ai',
    action: 'Reconciliation Executed',
    entity_type: 'reconciliation',
    entity_id: 'rec-grp-001',
    entity_title: 'ABC Corp - IT Services',
    details: 'Reconciled 3 documents. Flagged 1 High Discrepancy (₹ 70,000 variance).',
    created_at: '2025-04-26T14:32:05Z',
  },
  {
    id: 'aud-004',
    user_name: 'System (Finding Engine)',
    user_email: 'system@docusentinel.ai',
    action: 'Finding Created',
    entity_type: 'finding',
    entity_id: 'F-001',
    entity_title: 'Invoice exceeds PO amount',
    details: 'High severity discrepancy flagged against PO-12456.',
    created_at: '2025-04-26T14:32:10Z',
  },
  {
    id: 'aud-005',
    user_name: 'Gurumoorthy S',
    user_email: 'gurumoorthy@docusentinel.ai',
    action: 'Finding Reviewed',
    entity_type: 'finding',
    entity_id: 'F-004',
    entity_title: 'Payment term deviation',
    details: 'Marked as accepted. Comment added: Notified accounts payable to use Net 30.',
    created_at: '2025-04-25T18:00:00Z',
  },
];

export const INITIAL_CASE_HISTORY: CaseHistoryItem[] = [
  {
    id: 'case-001',
    name: 'Q2 Vendor Analysis',
    documents_count: 8,
    findings_count: 2,
    status: 'Open',
    last_updated: 'Apr 26, 2025',
  },
  {
    id: 'case-002',
    name: 'IT Services Contract',
    documents_count: 5,
    findings_count: 1,
    status: 'In Review',
    last_updated: 'Apr 26, 2025',
  },
  {
    id: 'case-003',
    name: 'Software Procurement',
    documents_count: 12,
    findings_count: 0,
    status: 'Resolved',
    last_updated: 'Apr 25, 2025',
  },
  {
    id: 'case-004',
    name: 'Hardware Purchase',
    documents_count: 4,
    findings_count: 0,
    status: 'Resolved',
    last_updated: 'Apr 23, 2025',
  },
  {
    id: 'case-005',
    name: 'Office Supplies',
    documents_count: 4,
    findings_count: 0,
    status: 'Archived',
    last_updated: 'Apr 21, 2025',
  },
];

// ------------------------------------------------------------
// Local Storage Keys
// ------------------------------------------------------------
const STORAGE_KEYS = {
  DOCUMENTS: 'ds_data_documents',
  EXTRACTED_FIELDS: 'ds_data_extracted_fields',
  LINE_ITEMS: 'ds_data_line_items',
  RECONCILIATION_GROUPS: 'ds_data_reconciliation_groups',
  FINDINGS: 'ds_data_findings',
  AUDIT_EVENTS: 'ds_data_audit_events',
  CASE_HISTORY: 'ds_data_case_history',
};

// ------------------------------------------------------------
// Store Helpers with Persistence
// ------------------------------------------------------------

export class DataStore {
  private static get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
      const item = localStorage.getItem(key);
      if (!item) {
        localStorage.setItem(key, JSON.stringify(fallback));
        return fallback;
      }
      return JSON.parse(item) as T;
    } catch {
      return fallback;
    }
  }

  private static set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  // Documents
  static getDocuments(): Document[] {
    return this.get<Document[]>(STORAGE_KEYS.DOCUMENTS, INITIAL_DOCUMENTS);
  }

  static getDocumentById(id: string): Document | null {
    return this.getDocuments().find((d) => d.id === id) ?? null;
  }

  static addDocument(doc: Document): Document {
    const docs = this.getDocuments();
    const updated = [doc, ...docs];
    this.set(STORAGE_KEYS.DOCUMENTS, updated);

    // Audit log
    this.addAuditEvent({
      user_name: 'Gurumoorthy S',
      user_email: 'gurumoorthy@docusentinel.ai',
      action: 'Document Uploaded',
      entity_type: 'document',
      entity_id: doc.id,
      entity_title: doc.file_name,
      details: `Uploaded ${doc.category} document (${(doc.file_size / (1024 * 1024)).toFixed(1)} MB).`,
    });

    return doc;
  }

  static updateDocumentStatus(id: string, status: DocumentStatus, error?: string): void {
    const docs = this.getDocuments().map((d) =>
      d.id === id
        ? {
            ...d,
            status,
            processing_error: error ?? null,
            processing_completed_at: status === 'completed' ? new Date().toISOString() : d.processing_completed_at,
            updated_at: new Date().toISOString(),
          }
        : d
    );
    this.set(STORAGE_KEYS.DOCUMENTS, docs);
  }

  static deleteDocument(id: string): void {
    const doc = this.getDocumentById(id);
    const docs = this.getDocuments().filter((d) => d.id !== id);
    this.set(STORAGE_KEYS.DOCUMENTS, docs);

    if (doc) {
      this.addAuditEvent({
        user_name: 'Gurumoorthy S',
        user_email: 'gurumoorthy@docusentinel.ai',
        action: 'Document Deleted',
        entity_type: 'document',
        entity_id: doc.id,
        entity_title: doc.file_name,
        details: `Deleted document ${doc.file_name} from workspace.`,
      });
    }
  }

  // Extracted Fields & Line Items
  static getExtractedFields(documentId?: string): ExtractedField[] {
    const fields = this.get<ExtractedField[]>(STORAGE_KEYS.EXTRACTED_FIELDS, INITIAL_EXTRACTED_FIELDS);
    return documentId ? fields.filter((f) => f.document_id === documentId) : fields;
  }

  static addExtractedFields(newFields: ExtractedField[]): void {
    const existing = this.get<ExtractedField[]>(STORAGE_KEYS.EXTRACTED_FIELDS, INITIAL_EXTRACTED_FIELDS);
    this.set(STORAGE_KEYS.EXTRACTED_FIELDS, [...newFields, ...existing]);
  }

  static getLineItems(documentId?: string): LineItem[] {
    const items = this.get<LineItem[]>(STORAGE_KEYS.LINE_ITEMS, INITIAL_LINE_ITEMS);
    return documentId ? items.filter((li) => li.document_id === documentId) : items;
  }

  static addLineItems(newItems: LineItem[]): void {
    const existing = this.get<LineItem[]>(STORAGE_KEYS.LINE_ITEMS, INITIAL_LINE_ITEMS);
    this.set(STORAGE_KEYS.LINE_ITEMS, [...newItems, ...existing]);
  }

  // Reconciliation Groups
  static getReconciliationGroups(): ReconciliationGroup[] {
    return this.get<ReconciliationGroup[]>(STORAGE_KEYS.RECONCILIATION_GROUPS, INITIAL_RECONCILIATION_GROUPS);
  }

  static getReconciliationGroupById(id: string): ReconciliationGroup | null {
    return this.getReconciliationGroups().find((g) => g.id === id) ?? null;
  }

  static addReconciliationGroup(group: ReconciliationGroup): void {
    const groups = this.getReconciliationGroups();
    this.set(STORAGE_KEYS.RECONCILIATION_GROUPS, [group, ...groups]);
  }

  // Findings
  static getFindings(): Finding[] {
    return this.get<Finding[]>(STORAGE_KEYS.FINDINGS, INITIAL_FINDINGS);
  }

  static getFindingById(id: string): Finding | null {
    return this.getFindings().find((f) => f.id === id) ?? null;
  }

  static updateFindingReview(
    findingId: string,
    decision: 'accepted' | 'rejected' | 'reviewing',
    comments: string,
    userName: string = 'Gurumoorthy S'
  ): Finding | null {
    const findings = this.getFindings();
    let updatedFinding: Finding | null = null;

    const newFindings = findings.map((f) => {
      if (f.id === findingId) {
        const nextStatus: FindingStatus = decision === 'accepted' ? 'accepted' : decision === 'rejected' ? 'rejected' : 'reviewing';
        updatedFinding = {
          ...f,
          status: nextStatus,
          is_reviewed: true,
          reviewed_by: userName,
          reviewed_at: new Date().toISOString(),
          review_decision: decision,
          review_comments: comments,
          updated_at: new Date().toISOString(),
        };
        return updatedFinding;
      }
      return f;
    });

    this.set(STORAGE_KEYS.FINDINGS, newFindings);

    if (updatedFinding) {
      this.addAuditEvent({
        user_name: userName,
        user_email: 'gurumoorthy@docusentinel.ai',
        action: 'Finding Reviewed',
        entity_type: 'finding',
        entity_id: findingId,
        entity_title: (updatedFinding as Finding).title,
        details: `Decision: ${decision.toUpperCase()}. Comment: ${comments || 'No comment provided'}. (Notice: Human-in-the-loop review only; does not authorize payment).`,
      });
    }

    return updatedFinding;
  }

  // Audit Events
  static getAuditEvents(): AuditEvent[] {
    return this.get<AuditEvent[]>(STORAGE_KEYS.AUDIT_EVENTS, INITIAL_AUDIT_EVENTS);
  }

  static addAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): AuditEvent {
    const newEvent: AuditEvent = {
      ...event,
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      created_at: new Date().toISOString(),
    };
    const events = this.getAuditEvents();
    this.set(STORAGE_KEYS.AUDIT_EVENTS, [newEvent, ...events]);
    return newEvent;
  }

  // Case History
  static getCaseHistory(): CaseHistoryItem[] {
    return this.get<CaseHistoryItem[]>(STORAGE_KEYS.CASE_HISTORY, INITIAL_CASE_HISTORY);
  }

  // Reset to initial demo state
  static resetDemoData(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(INITIAL_DOCUMENTS));
    localStorage.setItem(STORAGE_KEYS.EXTRACTED_FIELDS, JSON.stringify(INITIAL_EXTRACTED_FIELDS));
    localStorage.setItem(STORAGE_KEYS.LINE_ITEMS, JSON.stringify(INITIAL_LINE_ITEMS));
    localStorage.setItem(STORAGE_KEYS.RECONCILIATION_GROUPS, JSON.stringify(INITIAL_RECONCILIATION_GROUPS));
    localStorage.setItem(STORAGE_KEYS.FINDINGS, JSON.stringify(INITIAL_FINDINGS));
    localStorage.setItem(STORAGE_KEYS.AUDIT_EVENTS, JSON.stringify(INITIAL_AUDIT_EVENTS));
    localStorage.setItem(STORAGE_KEYS.CASE_HISTORY, JSON.stringify(INITIAL_CASE_HISTORY));
  }
}
