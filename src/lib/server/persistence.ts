/**
 * ServerPersistence facade.
 * Delegates all operations to the active IRepository (JsonRepository or SupabaseRepository)
 * selected via environment configuration.
 */

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
import { getRepository, type FindingReviewDecision } from './repository';
import type { ChainVerificationResult } from './auditChain';

export class ServerPersistence {
  // Documents
  static async getDocuments(userId?: string): Promise<Document[]> {
    return getRepository().getDocuments(userId);
  }

  static async getDocumentById(id: string): Promise<Document | null> {
    return getRepository().getDocumentById(id);
  }

  static async getDocumentByHash(fileHash: string): Promise<Document | null> {
    return getRepository().getDocumentByHash(fileHash);
  }

  static async createDocument(doc: Document): Promise<Document> {
    return getRepository().createDocument(doc);
  }

  static async updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
    return getRepository().updateDocument(id, updates);
  }

  static async deleteDocument(id: string): Promise<boolean> {
    return getRepository().deleteDocument(id);
  }

  // Extracted Fields
  static async getExtractedFields(documentId?: string): Promise<ExtractedField[]> {
    return getRepository().getExtractedFields(documentId);
  }

  static async saveExtractedFields(documentId: string, fields: ExtractedField[]): Promise<void> {
    return getRepository().saveExtractedFields(documentId, fields);
  }

  // Line Items
  static async getLineItems(documentId?: string): Promise<LineItem[]> {
    return getRepository().getLineItems(documentId);
  }

  static async saveLineItems(documentId: string, items: LineItem[]): Promise<void> {
    return getRepository().saveLineItems(documentId, items);
  }

  // Reconciliation Groups
  static async getReconciliationGroups(userId?: string): Promise<ReconciliationGroup[]> {
    return getRepository().getReconciliationGroups(userId);
  }

  static async getReconciliationGroupById(id: string): Promise<ReconciliationGroup | null> {
    return getRepository().getReconciliationGroupById(id);
  }

  static async saveReconciliationGroup(group: ReconciliationGroup): Promise<ReconciliationGroup> {
    return getRepository().saveReconciliationGroup(group);
  }

  static async saveReconciliationGroups(groups: ReconciliationGroup[]): Promise<void> {
    return getRepository().saveReconciliationGroups(groups);
  }

  // Findings
  static async getFindings(userId?: string): Promise<Finding[]> {
    return getRepository().getFindings(userId);
  }

  static async getFindingById(id: string): Promise<Finding | null> {
    return getRepository().getFindingById(id);
  }

  static async saveFindings(findings: Finding[]): Promise<void> {
    return getRepository().saveFindings(findings);
  }

  static async updateFindingReview(
    findingId: string,
    decision: FindingReviewDecision,
    comments: string,
    reviewerName: string = 'Demo Reviewer',
    reviewerEmail?: string
  ): Promise<Finding | null> {
    return getRepository().updateFindingReview(
      findingId,
      decision,
      comments,
      reviewerName,
      reviewerEmail
    );
  }

  // Audit Events
  static async getAuditEvents(): Promise<AuditEvent[]> {
    return getRepository().getAuditEvents();
  }

  static async addAuditEvent(
    event: Omit<AuditEvent, 'id' | 'created_at' | 'hash' | 'prev_hash'>
  ): Promise<AuditEvent> {
    return getRepository().addAuditEvent(event);
  }

  static async verifyAuditChain(): Promise<ChainVerificationResult> {
    return getRepository().verifyAuditChain();
  }

  // Case History
  static async getCaseHistory(): Promise<CaseHistoryItem[]> {
    return getRepository().getCaseHistory();
  }

  // Dashboard Stats
  static async getDashboardStats(): Promise<DashboardStats> {
    return getRepository().getDashboardStats();
  }

  // Access Checks
  static async canUserAccessDocument(
    userId?: string,
    docId?: string,
    userRole?: string
  ): Promise<boolean> {
    return getRepository().canUserAccessDocument(userId, docId, userRole);
  }

  static async canUserAccessFinding(
    userId?: string,
    findingId?: string,
    userRole?: string
  ): Promise<boolean> {
    return getRepository().canUserAccessFinding(userId, findingId, userRole);
  }

  // Reset
  static async resetData(): Promise<void> {
    return getRepository().resetData();
  }
}
