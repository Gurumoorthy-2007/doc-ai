import fs from 'fs/promises';
import path from 'path';
import type {
  Document,
  ExtractedField,
  LineItem,
  ReconciliationGroup,
  Finding,
  FindingStatus,
  DashboardStats,
} from '../types';
import {
  INITIAL_DOCUMENTS,
  INITIAL_EXTRACTED_FIELDS,
  INITIAL_LINE_ITEMS,
  INITIAL_RECONCILIATION_GROUPS,
  INITIAL_FINDINGS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_CASE_HISTORY,
  type AuditEvent,
  type CaseHistoryItem,
} from '../data/seedData';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  documents: Document[];
  extracted_fields: ExtractedField[];
  line_items: LineItem[];
  reconciliation_groups: ReconciliationGroup[];
  findings: Finding[];
  audit_events: AuditEvent[];
  case_history: CaseHistoryItem[];
  initialized_at: string;
}

function getDefaultDatabase(): DatabaseSchema {
  return {
    documents: INITIAL_DOCUMENTS ? JSON.parse(JSON.stringify(INITIAL_DOCUMENTS)) : [],
    extracted_fields: INITIAL_EXTRACTED_FIELDS ? JSON.parse(JSON.stringify(INITIAL_EXTRACTED_FIELDS)) : [],
    line_items: INITIAL_LINE_ITEMS ? JSON.parse(JSON.stringify(INITIAL_LINE_ITEMS)) : [],
    reconciliation_groups: INITIAL_RECONCILIATION_GROUPS ? JSON.parse(JSON.stringify(INITIAL_RECONCILIATION_GROUPS)) : [],
    findings: INITIAL_FINDINGS ? JSON.parse(JSON.stringify(INITIAL_FINDINGS)) : [],
    audit_events: INITIAL_AUDIT_EVENTS ? JSON.parse(JSON.stringify(INITIAL_AUDIT_EVENTS)) : [],
    case_history: INITIAL_CASE_HISTORY ? JSON.parse(JSON.stringify(INITIAL_CASE_HISTORY)) : [],
    initialized_at: new Date().toISOString(),
  };
}

let memoryDb: DatabaseSchema | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function readDatabase(): Promise<DatabaseSchema> {
  if (memoryDb) return memoryDb;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    memoryDb = JSON.parse(raw);
    return memoryDb!;
  } catch {
    const fresh = getDefaultDatabase();
    memoryDb = fresh;
    await writeDatabase(fresh);
    return fresh;
  }
}

async function writeDatabase(db: DatabaseSchema): Promise<void> {
  memoryDb = db;
  // Queue atomic writes and propagate failures
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    await fs.writeFile(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    await fs.rename(tempFile, DB_FILE);
  });
  await writeQueue;
}

export class ServerPersistence {
  // Documents
  static async getDocuments(userId?: string): Promise<Document[]> {
    const db = await readDatabase();
    if (!userId) return db.documents;
    return db.documents.filter((d) => d.user_id === userId);
  }

  static async getDocumentById(id: string): Promise<Document | null> {
    const db = await readDatabase();
    return db.documents.find((d) => d.id === id) ?? null;
  }

  static async getDocumentByHash(fileHash: string): Promise<Document | null> {
    const db = await readDatabase();
    return db.documents.find((d) => d.file_hash === fileHash) ?? null;
  }

  static async createDocument(doc: Document): Promise<Document> {
    const db = await readDatabase();
    const existingIdx = db.documents.findIndex((d) => d.id === doc.id);
    if (existingIdx >= 0) {
      db.documents[existingIdx] = doc;
    } else {
      db.documents.unshift(doc);
    }
    await writeDatabase(db);
    return doc;
  }

  static async updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
    const db = await readDatabase();
    const idx = db.documents.findIndex((d) => d.id === id);
    if (idx < 0) return null;

    db.documents[idx] = {
      ...db.documents[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await writeDatabase(db);
    return db.documents[idx];
  }

  static async deleteDocument(id: string): Promise<boolean> {
    const db = await readDatabase();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) return false;

    db.documents = db.documents.filter((d) => d.id !== id);
    db.extracted_fields = db.extracted_fields.filter((f) => f.document_id !== id);
    db.line_items = db.line_items.filter((li) => li.document_id !== id);
    // Remove related findings or unlink
    db.findings = db.findings.filter((f) => f.source_document_id !== id && f.compared_document_id !== id);

    await writeDatabase(db);
    return true;
  }

  // Extracted Fields
  static async getExtractedFields(documentId?: string): Promise<ExtractedField[]> {
    const db = await readDatabase();
    if (!documentId) return db.extracted_fields;
    return db.extracted_fields.filter((f) => f.document_id === documentId);
  }

  static async saveExtractedFields(documentId: string, fields: ExtractedField[]): Promise<void> {
    const db = await readDatabase();
    // Remove existing for this document
    db.extracted_fields = db.extracted_fields.filter((f) => f.document_id !== documentId);
    const normalized = fields.map((f, i) => ({
      ...f,
      id: f.id || `field-${documentId}-${i + 1}`,
      document_id: documentId,
      created_at: f.created_at || new Date().toISOString(),
    }));
    db.extracted_fields.unshift(...normalized);
    await writeDatabase(db);
  }

  // Line Items
  static async getLineItems(documentId?: string): Promise<LineItem[]> {
    const db = await readDatabase();
    if (!documentId) return db.line_items;
    return db.line_items.filter((li) => li.document_id === documentId);
  }

  static async saveLineItems(documentId: string, items: LineItem[]): Promise<void> {
    const db = await readDatabase();
    db.line_items = db.line_items.filter((li) => li.document_id !== documentId);
    const normalized = items.map((li, i) => ({
      ...li,
      id: li.id || `li-${documentId}-${i + 1}`,
      document_id: documentId,
      created_at: li.created_at || new Date().toISOString(),
    }));
    db.line_items.unshift(...normalized);
    await writeDatabase(db);
  }

  // Reconciliation Groups
  static async getReconciliationGroups(userId?: string): Promise<ReconciliationGroup[]> {
    const db = await readDatabase();
    if (!userId) return db.reconciliation_groups;
    return db.reconciliation_groups.filter((g) => g.user_id === userId);
  }

  static async getReconciliationGroupById(id: string): Promise<ReconciliationGroup | null> {
    const db = await readDatabase();
    return db.reconciliation_groups.find((g) => g.id === id) ?? null;
  }

  static async saveReconciliationGroup(group: ReconciliationGroup): Promise<ReconciliationGroup> {
    const db = await readDatabase();
    const idx = db.reconciliation_groups.findIndex((g) => g.id === group.id);
    if (idx >= 0) {
      db.reconciliation_groups[idx] = group;
    } else {
      db.reconciliation_groups.unshift(group);
    }
    await writeDatabase(db);
    return group;
  }

  static async saveReconciliationGroups(groups: ReconciliationGroup[]): Promise<void> {
    const db = await readDatabase();
    for (const group of groups) {
      const idx = db.reconciliation_groups.findIndex((g) => g.id === group.id);
      if (idx >= 0) {
        db.reconciliation_groups[idx] = group;
      } else {
        db.reconciliation_groups.unshift(group);
      }
    }
    await writeDatabase(db);
  }

  // Findings
  static async getFindings(userId?: string): Promise<Finding[]> {
    const db = await readDatabase();
    if (!userId) return db.findings;
    return db.findings.filter((f) => f.user_id === userId);
  }

  static async getFindingById(id: string): Promise<Finding | null> {
    const db = await readDatabase();
    return db.findings.find((f) => f.id === id) ?? null;
  }

  /**
   * Saves findings while ensuring reprocessing does not erase review history or create duplicates.
   */
  static async saveFindings(findings: Finding[]): Promise<void> {
    const db = await readDatabase();
    for (const f of findings) {
      // 1. First check exact ID match
      let idx = db.findings.findIndex((existing) => existing.id === f.id);

      // 2. If not found by ID, check composite business key for existing finding across reprocessing
      if (idx < 0 && f.rule_id && f.source_document_id && f.source_field) {
        idx = db.findings.findIndex((existing) =>
          existing.rule_id === f.rule_id &&
          existing.source_document_id === f.source_document_id &&
          existing.compared_document_id === f.compared_document_id &&
          existing.source_field === f.source_field
        );
      }

      if (idx >= 0) {
        const existing = db.findings[idx];
        const preservedId = existing.id;
        // If finding was already reviewed or has decision history, preserve review decisions!
        if (existing.is_reviewed || existing.status !== 'open' || existing.review_decision) {
          db.findings[idx] = {
            ...f,
            id: preservedId,
            status: existing.status,
            is_reviewed: existing.is_reviewed,
            review_decision: existing.review_decision,
            review_comments: existing.review_comments,
            reviewed_by: existing.reviewed_by,
            reviewed_at: existing.reviewed_at,
            decision_history: existing.decision_history || [],
            created_at: existing.created_at,
            updated_at: new Date().toISOString(),
          };
        } else {
          db.findings[idx] = {
            ...f,
            id: f.id || preservedId,
            created_at: existing.created_at,
            updated_at: new Date().toISOString(),
          };
        }
      } else {
        db.findings.unshift(f);
      }
    }
    await writeDatabase(db);
  }

  static async updateFindingReview(
    findingId: string,
    decision: 'accepted' | 'rejected' | 'reviewing' | 'resolved',
    comments: string,
    reviewerName: string = 'Demo Reviewer',
    reviewerEmail?: string
  ): Promise<Finding | null> {
    const db = await readDatabase();
    const finding = db.findings.find((f) => f.id === findingId);
    if (!finding) return null;

    const nextStatus: FindingStatus =
      decision === 'accepted'
        ? 'accepted'
        : decision === 'rejected'
        ? 'rejected'
        : decision === 'resolved'
        ? 'resolved'
        : 'in_review';

    finding.status = nextStatus;
    finding.is_reviewed = decision !== 'reviewing';
    finding.reviewed_by = reviewerName;
    finding.reviewed_at = new Date().toISOString();
    finding.review_decision = decision;
    finding.review_comments = comments;
    finding.updated_at = new Date().toISOString();

    if (!finding.decision_history) {
      finding.decision_history = [];
    }
    finding.decision_history.push({
      decision,
      comments: comments || 'No commentary provided',
      reviewer: reviewerName,
      reviewed_by: reviewerName,
      timestamp: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    });

    // Add audit event
    await this.addAuditEvent({
      user_name: reviewerName,
      user_email: reviewerEmail || 'demo@docusentinel.local',
      action: 'Finding Reviewed',
      entity_type: 'finding',
      entity_id: findingId,
      entity_title: finding.title,
      details: `Decision: ${decision.toUpperCase()}. Comment: ${comments || 'No comment provided'}. Status changed to ${nextStatus}. (Notice: Human-in-the-loop review only; does not authorize payment).`,
    });

    await writeDatabase(db);
    return finding;
  }

  // Access Authorization Helpers
  static async canUserAccessDocument(
    userId?: string,
    docId?: string,
    userRole?: string
  ): Promise<boolean> {
    if (!docId) return false;
    if (!userId) return false;
    if (userRole === 'admin' || userRole === 'reviewer' || userId === 'usr-demo-admin-001') {
      return true;
    }
    const doc = await this.getDocumentById(docId);
    if (!doc) return false;
    return doc.user_id === userId;
  }

  static async canUserAccessFinding(
    userId?: string,
    findingId?: string,
    userRole?: string
  ): Promise<boolean> {
    if (!findingId) return false;
    if (!userId) return false;
    if (userRole === 'admin' || userRole === 'reviewer' || userId === 'usr-demo-admin-001') {
      return true;
    }
    const finding = await this.getFindingById(findingId);
    if (!finding) return false;
    return finding.user_id === userId;
  }

  // Audit Events
  static async getAuditEvents(): Promise<AuditEvent[]> {
    const db = await readDatabase();
    return db.audit_events;
  }

  static async addAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): Promise<AuditEvent> {
    const db = await readDatabase();
    const newEvent: AuditEvent = {
      ...event,
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    db.audit_events.unshift(newEvent);
    await writeDatabase(db);
    return newEvent;
  }

  // Case History
  static async getCaseHistory(): Promise<CaseHistoryItem[]> {
    const db = await readDatabase();
    return db.case_history;
  }

  // Dashboard Stats (Calculated genuinely from real saved data)
  static async getDashboardStats(): Promise<DashboardStats> {
    const db = await readDatabase();
    const docs = db.documents;
    const findings = db.findings;
    const recons = db.reconciliation_groups;

    const total_documents = docs.length;
    const processed_documents = docs.filter((d) => d.status === 'completed').length;
    const pending_documents = docs.filter((d) => d.status === 'uploading' || d.status === 'uploaded' || d.status === 'processing').length;
    const error_documents = docs.filter((d) => d.status === 'error').length;
    const processing_rate = total_documents > 0 ? Math.round((processed_documents / total_documents) * 100) : 100;

    const total_findings = findings.length;
    const critical_findings = findings.filter((f) => f.severity === 'critical').length;
    const high_findings = findings.filter((f) => f.severity === 'high').length;
    const medium_findings = findings.filter((f) => f.severity === 'medium').length;
    const low_findings = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;
    const open_findings = findings.filter((f) => f.status === 'open').length;
    const in_review_findings = findings.filter((f) => f.status === 'in_review' || f.status === 'reviewing').length;
    const resolved_findings = findings.filter((f) => f.status === 'resolved').length;
    const rejected_findings = findings.filter((f) => f.status === 'rejected').length;
    const accepted_findings = findings.filter((f) => f.status === 'accepted').length;
    const pendingReview = findings.filter(
      (f) => !f.is_reviewed && f.status !== 'resolved' && f.status !== 'accepted' && f.status !== 'rejected'
    ).length;

    const total_reconciliations = recons.length;
    const matched_reconciliations = recons.filter((r) => r.status === 'matched').length;
    const discrepancy_reconciliations = recons.filter((r) => r.status === 'discrepancy').length;
    const missing_reconciliations = recons.filter((r) => r.status === 'missing_po' || r.status === 'missing_invoice').length;
    const reconciliation_accuracy = total_reconciliations > 0
      ? Math.round((matched_reconciliations / total_reconciliations) * 100)
      : 100;

    const total_financial_impact = findings.reduce((sum, f) => sum + (f.financial_impact || 0), 0);
    const uniqueVendors = new Set(
      docs
        .map((d) => d.file_name.split(/[-_]/)[0])
        .concat(recons.map((r) => r.vendor_name || ''))
        .filter((v) => v.trim().length > 0)
    );
    const active_vendors = uniqueVendors.size;

    // Genuine trend from document created_at dates
    const dateCounts: Record<string, { processed: number; pending: number; errors: number }> = {};
    for (const doc of docs) {
      const d = doc.created_at ? doc.created_at.split('T')[0] : 'Today';
      if (!dateCounts[d]) {
        dateCounts[d] = { processed: 0, pending: 0, errors: 0 };
      }
      if (doc.status === 'completed') dateCounts[d].processed++;
      else if (doc.status === 'error') dateCounts[d].errors++;
      else dateCounts[d].pending++;
    }

    const processing_trend = Object.entries(dateCounts)
      .map(([date, counts]) => ({
        date,
        ...counts,
      }))
      .slice(-7);

    return {
      total_documents,
      totalDocuments: total_documents,
      processed_documents,
      completedDocuments: processed_documents,
      pending_documents,
      pendingDocuments: pending_documents,
      error_documents,
      failedDocuments: error_documents,
      processing_rate,
      total_findings,
      totalFindings: total_findings,
      critical_findings,
      high_findings,
      medium_findings,
      low_findings,
      open_findings,
      openFindings: open_findings,
      in_review_findings,
      resolved_findings,
      rejected_findings,
      accepted_findings,
      pendingReview,
      total_reconciliations,
      matched_reconciliations,
      discrepancy_reconciliations,
      missing_reconciliations,
      reconciliation_accuracy,
      total_financial_impact,
      flaggedVariance: total_financial_impact,
      active_vendors,
      recent_activity: db.audit_events.slice(0, 10) as unknown as AuditEvent[],
      recentFindings: findings.slice(0, 5),
      recentAuditEvents: db.audit_events.slice(0, 10) as unknown as AuditEvent[],
      recentReconciliations: recons.slice(0, 5),
      processing_trend,
    } as unknown as DashboardStats;
  }

  // Reset to initial demo state
  static async resetData(): Promise<void> {
    const fresh = getDefaultDatabase();
    await writeDatabase(fresh);
  }
}
