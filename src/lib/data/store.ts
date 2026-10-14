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
} from './seedData';
export * from './seedData';

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
      user_name: 'Demo User',
      user_email: 'demo@docusentinel.local',
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
        user_name: 'Demo User',
        user_email: 'demo@docusentinel.local',
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
    decision: 'accepted' | 'rejected' | 'reviewing' | 'resolved',
    comments: string,
    userName: string = 'Demo Reviewer'
  ): Finding | null {
    const findings = this.getFindings();
    let updatedFinding: Finding | null = null;

    const newFindings = findings.map((f) => {
      if (f.id === findingId) {
        const nextStatus: FindingStatus =
          decision === 'accepted'
            ? 'accepted'
            : decision === 'rejected'
            ? 'rejected'
            : decision === 'resolved'
            ? 'resolved'
            : 'in_review';

        const history = f.decision_history ? [...f.decision_history] : [];
        history.push({
          decision,
          comments: comments || 'No commentary provided',
          reviewer: userName,
          reviewed_by: userName,
          timestamp: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
        });

        updatedFinding = {
          ...f,
          status: nextStatus,
          is_reviewed: decision !== 'reviewing',
          reviewed_by: userName,
          reviewed_at: new Date().toISOString(),
          review_decision: decision,
          review_comments: comments,
          decision_history: history,
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
        user_email: 'demo@docusentinel.local',
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

  // ============================================================
  // Asynchronous API Layer (Communicates with /api endpoints)
  // ============================================================

  static async fetchDocuments(category?: string, status?: string, q?: string): Promise<Document[]> {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      if (status && status !== 'all') params.set('status', status);
      if (q) params.set('q', q);

      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        this.set(STORAGE_KEYS.DOCUMENTS, json.data);
        return json.data;
      }
    } catch {
      // Fall back to local cache
    }
    return this.getDocuments();
  }

  static async uploadDocument(
    file: File,
    category?: DocumentCategory
  ): Promise<{ document: Document; fields: ExtractedField[]; lineItems: LineItem[] }> {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);

    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Upload failed with status ${res.status}`);
    }

    const { document, fields, lineItems } = json.data;
    if (document) {
      this.addDocument(document);
    }
    if (fields && fields.length > 0) {
      this.addExtractedFields(fields);
    }
    if (lineItems && lineItems.length > 0) {
      this.addLineItems(lineItems);
    }

    return { document, fields: fields || [], lineItems: lineItems || [] };
  }

  static async fetchDocumentDetails(id: string): Promise<{
    document: Document | null;
    fields: ExtractedField[];
    lineItems: LineItem[];
    findings: Finding[];
  }> {
    try {
      const res = await fetch(`/api/documents/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return {
            document: json.data.document,
            fields: json.data.fields || [],
            lineItems: json.data.lineItems || [],
            findings: json.data.findings || [],
          };
        }
      }
    } catch {
      // Fall back to local cache
    }

    const doc = this.getDocumentById(id);
    return {
      document: doc,
      fields: doc ? this.getExtractedFields(doc.id) : [],
      lineItems: doc ? this.getLineItems(doc.id) : [],
      findings: doc
        ? this.getFindings().filter(
            (f) => f.source_document_id === doc.id || f.compared_document_id === doc.id
          )
        : [],
    };
  }

  static async updateDocumentFieldsApi(
    documentId: string,
    fields: ExtractedField[],
    lineItems: LineItem[]
  ): Promise<{ success: boolean; fields: ExtractedField[]; lineItems: LineItem[] }> {
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields, lineItems }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        // Update local storage cache
        const allFields = this.get<ExtractedField[]>(STORAGE_KEYS.EXTRACTED_FIELDS, INITIAL_EXTRACTED_FIELDS)
          .filter((f) => f.document_id !== documentId);
        this.set(STORAGE_KEYS.EXTRACTED_FIELDS, [...data.data.fields, ...allFields]);

        const allItems = this.get<LineItem[]>(STORAGE_KEYS.LINE_ITEMS, INITIAL_LINE_ITEMS)
          .filter((li) => li.document_id !== documentId);
        this.set(STORAGE_KEYS.LINE_ITEMS, [...data.data.lineItems, ...allItems]);

        return {
          success: true,
          fields: data.data.fields,
          lineItems: data.data.lineItems,
        };
      }
      throw new Error(data.error || 'Failed to update document data table');
    } catch {
      // Fallback local update
      const allFields = this.get<ExtractedField[]>(STORAGE_KEYS.EXTRACTED_FIELDS, INITIAL_EXTRACTED_FIELDS)
        .filter((f) => f.document_id !== documentId);
      this.set(STORAGE_KEYS.EXTRACTED_FIELDS, [...fields, ...allFields]);

      const allItems = this.get<LineItem[]>(STORAGE_KEYS.LINE_ITEMS, INITIAL_LINE_ITEMS)
        .filter((li) => li.document_id !== documentId);
      this.set(STORAGE_KEYS.LINE_ITEMS, [...lineItems, ...allItems]);

      return { success: true, fields, lineItems };
    }
  }

  static async reprocessDocumentApi(id: string): Promise<Document | null> {
    try {
      const res = await fetch(`/api/documents/${id}/process`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.document) {
          const doc = json.data.document;
          const currentDocs = this.getDocuments().map((d) => (d.id === id ? doc : d));
          this.set(STORAGE_KEYS.DOCUMENTS, currentDocs);
          if (json.data.fields) this.addExtractedFields(json.data.fields);
          if (json.data.lineItems) this.addLineItems(json.data.lineItems);
          return doc;
        }
      }
    } catch {
      // ignore
    }
    return this.getDocumentById(id);
  }

  static async deleteDocumentApi(id: string): Promise<void> {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    this.deleteDocument(id);
  }

  static async fetchFindings(severity?: string, status?: string, q?: string): Promise<Finding[]> {
    try {
      const params = new URLSearchParams();
      if (severity && severity !== 'all') params.set('severity', severity);
      if (status && status !== 'all') params.set('status', status);
      if (q) params.set('q', q);

      const res = await fetch(`/api/findings?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          this.set(STORAGE_KEYS.FINDINGS, json.data);
          return json.data;
        }
      }
    } catch {
      // Fall back
    }
    return this.getFindings();
  }

  static async fetchFindingDetails(id: string): Promise<{
    finding: Finding | null;
    sourceDocument: Document | null;
    comparedDocument: Document | null;
    sourceFields: ExtractedField[];
  }> {
    try {
      const res = await fetch(`/api/findings/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return {
            finding: json.data.finding,
            sourceDocument: json.data.sourceDocument,
            comparedDocument: json.data.comparedDocument,
            sourceFields: json.data.sourceFields || [],
          };
        }
      }
    } catch {
      // Fall back
    }

    const finding = this.getFindingById(id);
    const sourceDoc = finding?.source_document_id ? this.getDocumentById(finding.source_document_id) : null;
    const comparedDoc = finding?.compared_document_id ? this.getDocumentById(finding.compared_document_id) : null;
    const sourceFields = sourceDoc ? this.getExtractedFields(sourceDoc.id) : [];

    return {
      finding,
      sourceDocument: sourceDoc,
      comparedDocument: comparedDoc,
      sourceFields,
    };
  }

  static async getFindingEvidence(id: string) {
    return this.fetchFindingDetails(id);
  }

  static async saveFindingReviewApi(
    findingId: string,
    decision: 'accepted' | 'rejected' | 'reviewing' | 'resolved',
    comments: string,
    reviewerName: string = 'Demo Reviewer'
  ): Promise<Finding | null> {
    try {
      const res = await fetch(`/api/findings/${findingId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comments, reviewerName }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          // Update cache
          const list = this.getFindings().map((f) => (f.id === findingId ? json.data : f));
          this.set(STORAGE_KEYS.FINDINGS, list);
          return json.data;
        }
      }
    } catch {
      // Fall back
    }
    return this.updateFindingReview(findingId, decision, comments, reviewerName);
  }

  static async fetchReconciliations(): Promise<ReconciliationGroup[]> {
    try {
      const res = await fetch('/api/reconciliation');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          this.set(STORAGE_KEYS.RECONCILIATION_GROUPS, json.data);
          return json.data;
        }
      }
    } catch {
      // Fall back
    }
    return this.getReconciliationGroups();
  }

  static async runReconciliationApi(params?: {
    contractId?: string;
    purchaseOrderId?: string;
    invoiceId?: string;
    groupName?: string;
  }): Promise<{ group: ReconciliationGroup; findings: Finding[] }> {
    const res = await fetch('/api/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Reconciliation failed with status ${res.status}`);
    }

    if (json.data?.group) {
      this.addReconciliationGroup(json.data.group);
    }
    if (json.data?.findings && json.data.findings.length > 0) {
      const currentFindings = this.getFindings();
      this.set(STORAGE_KEYS.FINDINGS, [...json.data.findings, ...currentFindings]);
    }

    return {
      group: json.data.group,
      findings: json.data.findings || [],
    };
  }

  static async fetchDashboardStats(): Promise<any> {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  static async fetchAuditTrail(): Promise<{ auditEvents: AuditEvent[]; caseHistory: CaseHistoryItem[] }> {
    try {
      const res = await fetch('/api/audit-trail');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.auditEvents) this.set(STORAGE_KEYS.AUDIT_EVENTS, json.data.auditEvents);
          if (json.data.caseHistory) this.set(STORAGE_KEYS.CASE_HISTORY, json.data.caseHistory);
          return json.data;
        }
      }
    } catch {
      // ignore
    }
    return {
      auditEvents: this.getAuditEvents(),
      caseHistory: this.getCaseHistory(),
    };
  }

  static async resetDemoDataApi(): Promise<void> {
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
    } catch {
      // ignore
    }
    this.resetDemoData();
  }
}
