// ============================================================
// DocuSentinel AI — Core Type Definitions
// ============================================================

export type DocumentCategory = 
  | 'contract' 
  | 'purchase_order' 
  | 'invoice' 
  | 'receipt' 
  | 'statement' 
  | 'compliance' 
  | 'other';

export type DocumentStatus = 
  | 'uploading' 
  | 'uploaded' 
  | 'processing' 
  | 'completed' 
  | 'error';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingStatus = 'open' | 'in_review' | 'reviewing' | 'accepted' | 'rejected' | 'resolved';

export type FindingType =
  | 'amount_mismatch'
  | 'supplier_mismatch'
  | 'currency_mismatch'
  | 'quantity_discrepancy'
  | 'unit_price_discrepancy'
  | 'missing_field'
  | 'duplicate_invoice'
  | 'payment_term_mismatch'
  | 'date_discrepancy'
  | 'exceeds_po_amount'
  | 'exceeds_contract_value'
  | 'tax_discrepancy'
  | 'vendor_name_variation'
  | 'unusual_amount'
  | 'other';

export type ReconciliationStatus =
  | 'pending'
  | 'matched'
  | 'discrepancy'
  | 'missing_po'
  | 'missing_invoice'
  | 'error';

export type UserRole = 'user' | 'admin' | 'reviewer';

// ============================================================
// Database Row Types
// ============================================================

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  category: DocumentCategory;
  classified_as: DocumentCategory | null;
  status: DocumentStatus;
  page_count: number | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processing_error: string | null;
  processing_attempts: number;
  file_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedField {
  id: string;
  document_id: string;
  field_name: string;
  field_value: string | null;
  field_type: string;
  confidence: number | null;
  is_missing: boolean;
  is_ambiguous: boolean;
  source_text: string | null;
  source_page: number | null;
  created_at: string;
}

export interface LineItem {
  id: string;
  document_id: string;
  item_number: number | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  unit: string | null;
  source_page: number | null;
  created_at: string;
}

export interface ReconciliationGroup {
  id: string;
  user_id: string;
  name: string | null;
  contract_id: string | null;
  purchase_order_id: string | null;
  invoice_id: string | null;
  status: ReconciliationStatus;
  contract_value: number | null;
  po_value: number | null;
  invoice_value: number | null;
  variance: number | null;
  variance_percentage: number | null;
  currency: string | null;
  vendor_name: string | null;
  reconciled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  contract?: Document | null;
  purchase_order?: Document | null;
  invoice?: Document | null;
}

export interface Finding {
  id: string;
  user_id: string;
  rule_id?: string | null;
  reconciliation_group_id: string | null;
  finding_type: FindingType;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  description: string;
  reason: string | null;
  source_document_id: string | null;
  compared_document_id: string | null;
  source_value: string | null;
  compared_value: string | null;
  variance?: number | null;
  financial_impact: number | null;
  currency: string | null;
  calculation_method?: string | null;
  source_field: string | null;
  source_page: number | null;
  source_text: string | null;
  compared_field: string | null;
  compared_page: number | null;
  compared_text: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_reviewed?: boolean;
  review_decision?: 'accepted' | 'rejected' | 'reviewing' | 'resolved' | null;
  review_comments?: string | null;
  decision_history?: Array<{
    decision: 'accepted' | 'rejected' | 'reviewing' | 'resolved' | string;
    comments: string;
    reviewed_by?: string;
    reviewed_at?: string;
    reviewer?: string;
    timestamp?: string;
  }>;
  created_at: string;
  updated_at: string;
  // Joined relations
  source_document?: Document | null;
  compared_document?: Document | null;
  reconciliation_group?: ReconciliationGroup | null;
  reviewer?: Profile | null;
}

export interface ReviewComment {
  id: string;
  finding_id: string;
  user_id: string;
  comment: string;
  action: 'comment' | 'accept' | 'reject' | 'mark_reviewed' | 'reopen' | 'escalate';
  previous_status: FindingStatus | null;
  new_status: FindingStatus | null;
  created_at: string;
  // Joined
  user?: Profile;
}

export interface AuditEvent {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_title?: string;
  details: Record<string, unknown> | string;
  ip_address?: string | null;
  user_agent?: string | null;
  prev_hash?: string | null;
  hash?: string;
  created_at: string;
  // Joined
  user?: Profile;
}

// ============================================================
// AI Extraction Schema Types
// ============================================================

export interface ContractExtraction {
  contract_number: string | null;
  parties: string[];
  supplier_name: string | null;
  customer_name?: string | null;
  contract_value: number | null;
  currency: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  renewal_date?: string | null;
  delivery_deadline?: string | null;
  termination_clause?: string | null;
  payment_terms: string | null;
  deadlines: string[];
  obligations: string[];
}

export interface PurchaseOrderExtraction {
  po_number: string | null;
  supplier_name: string | null;
  customer_name?: string | null;
  contract_reference?: string | null;
  currency: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  delivery_deadline?: string | null;
  payment_terms: string | null;
  subtotal: number | null;
  discount?: number | null;
  tax: number | null;
  total: number | null;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
    unit: string | null;
  }>;
}

export interface InvoiceExtraction {
  invoice_number: string | null;
  supplier_name: string | null;
  customer_name?: string | null;
  contract_reference?: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  po_reference: string | null;
  payment_terms: string | null;
  subtotal: number | null;
  discount?: number | null;
  tax: number | null;
  total: number | null;
  line_items: Array<{
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
    unit: string | null;
  }>;
}

export type ExtractionResult = 
  | { type: 'contract'; data: ContractExtraction }
  | { type: 'purchase_order'; data: PurchaseOrderExtraction }
  | { type: 'invoice'; data: InvoiceExtraction };

export interface EnhancedExtractionOutput {
  result: ExtractionResult;
  fields: ExtractedField[];
  lineItems: LineItem[];
  modelUsed: string;
  sourceConfidence: number;
}

// ============================================================
// Dashboard Statistics
// ============================================================

export interface DashboardStats {
  total_documents: number;
  processed_documents: number;
  pending_documents: number;
  error_documents: number;
  processing_rate: number;
  total_findings: number;
  critical_findings: number;
  high_findings: number;
  medium_findings: number;
  low_findings: number;
  open_findings: number;
  total_reconciliations: number;
  matched_reconciliations: number;
  discrepancy_reconciliations: number;
  missing_reconciliations: number;
  reconciliation_accuracy: number;
  total_financial_impact: number;
  active_vendors: number;
  recent_activity: AuditEvent[];
  recentAuditEvents?: AuditEvent[];
  recentFindings?: Finding[];
  recentReconciliations?: ReconciliationGroup[];
  pendingReview?: number;
  flaggedVariance?: number;
  processing_trend: Array<{
    date: string;
    processed: number;
    pending: number;
    errors: number;
  }>;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
