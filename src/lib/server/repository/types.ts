import type {
  Document,
  ExtractedField,
  LineItem,
  ReconciliationGroup,
  Finding,
  DashboardStats,
  AuditEvent,
} from '@/lib/types';
import type { CaseHistoryItem } from '@/lib/data/seedData';
import type { ChainVerificationResult } from '@/lib/server/auditChain';

export type FindingReviewDecision = 'accepted' | 'rejected' | 'reviewing' | 'resolved';

export interface IRepository {
  // Documents
  getDocuments(userId?: string): Promise<Document[]>;
  getDocumentById(id: string): Promise<Document | null>;
  getDocumentByHash(fileHash: string): Promise<Document | null>;
  createDocument(doc: Document): Promise<Document>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document | null>;
  deleteDocument(id: string): Promise<boolean>;

  // Extracted Fields
  getExtractedFields(documentId?: string): Promise<ExtractedField[]>;
  saveExtractedFields(documentId: string, fields: ExtractedField[]): Promise<void>;

  // Line Items
  getLineItems(documentId?: string): Promise<LineItem[]>;
  saveLineItems(documentId: string, items: LineItem[]): Promise<void>;

  // Reconciliation Groups
  getReconciliationGroups(userId?: string): Promise<ReconciliationGroup[]>;
  getReconciliationGroupById(id: string): Promise<ReconciliationGroup | null>;
  saveReconciliationGroup(group: ReconciliationGroup): Promise<ReconciliationGroup>;
  saveReconciliationGroups(groups: ReconciliationGroup[]): Promise<void>;

  // Findings
  getFindings(userId?: string): Promise<Finding[]>;
  getFindingById(id: string): Promise<Finding | null>;
  saveFindings(findings: Finding[]): Promise<void>;
  updateFindingReview(
    findingId: string,
    decision: FindingReviewDecision,
    comments: string,
    reviewerName?: string,
    reviewerEmail?: string
  ): Promise<Finding | null>;

  // Audit Trail & Cryptographic Chain
  getAuditEvents(): Promise<AuditEvent[]>;
  addAuditEvent(
    event: Omit<AuditEvent, 'id' | 'created_at' | 'hash' | 'prev_hash'>
  ): Promise<AuditEvent>;
  verifyAuditChain(): Promise<ChainVerificationResult>;

  // Case History & Dashboard Stats
  getCaseHistory(): Promise<CaseHistoryItem[]>;
  getDashboardStats(): Promise<DashboardStats>;

  // Authorization Helpers & Lifecycle
  canUserAccessDocument(userId?: string, docId?: string, userRole?: string): Promise<boolean>;
  canUserAccessFinding(userId?: string, findingId?: string, userRole?: string): Promise<boolean>;
  resetData(): Promise<void>;
}
