'use client';

// ============================================================
// DocuSentinel AI — Client API Client & In-Memory Cache
// The server is the single source of truth. All data is fetched
// and mutated via /api/* routes; localStorage business data has
// been completely removed.
// ============================================================

import type {
  Document,
  ExtractedField,
  LineItem,
  ReconciliationGroup,
  Finding,
  DocumentCategory,
  DocumentStatus,
  DashboardStats,
} from '../types';
import type { AuditEvent, CaseHistoryItem } from './seedData';
import type { ChainVerificationResult } from '../server/auditChain';

export * from './seedData';

// Legacy keys to clean up from earlier builds
const LEGACY_STORAGE_KEYS = [
  'ds_data_documents',
  'ds_data_extracted_fields',
  'ds_data_line_items',
  'ds_data_reconciliation_groups',
  'ds_data_findings',
  'ds_data_audit_events',
  'ds_data_case_history',
];

function clearLegacyLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors
  }
}

// Clean up legacy localStorage on module load
if (typeof window !== 'undefined') {
  clearLegacyLocalStorage();
}

interface MemoryCache {
  documents: Document[];
  extractedFields: ExtractedField[];
  lineItems: LineItem[];
  reconciliationGroups: ReconciliationGroup[];
  findings: Finding[];
  auditEvents: AuditEvent[];
  caseHistory: CaseHistoryItem[];
  dashboardStats: DashboardStats | null;
}

const memoryCache: MemoryCache = {
  documents: [],
  extractedFields: [],
  lineItems: [],
  reconciliationGroups: [],
  findings: [],
  auditEvents: [],
  caseHistory: [],
  dashboardStats: null,
};

export class DataStore {
  // ── Synchronous getters (read from in-memory cache) ──────────────────
  static getDocuments(): Document[] {
    return memoryCache.documents;
  }

  static getDocumentById(id: string): Document | null {
    return memoryCache.documents.find((d) => d.id === id) ?? null;
  }

  static getExtractedFields(documentId?: string): ExtractedField[] {
    if (!documentId) return memoryCache.extractedFields;
    return memoryCache.extractedFields.filter((f) => f.document_id === documentId);
  }

  static getLineItems(documentId?: string): LineItem[] {
    if (!documentId) return memoryCache.lineItems;
    return memoryCache.lineItems.filter((li) => li.document_id === documentId);
  }

  static getReconciliationGroups(): ReconciliationGroup[] {
    return memoryCache.reconciliationGroups;
  }

  static getReconciliationGroupById(id: string): ReconciliationGroup | null {
    return memoryCache.reconciliationGroups.find((g) => g.id === id) ?? null;
  }

  static getFindings(): Finding[] {
    return memoryCache.findings;
  }

  static getFindingById(id: string): Finding | null {
    return memoryCache.findings.find((f) => f.id === id) ?? null;
  }

  static getAuditEvents(): AuditEvent[] {
    return memoryCache.auditEvents;
  }

  static getCaseHistory(): CaseHistoryItem[] {
    return memoryCache.caseHistory;
  }

  // ── Client In-Memory Updaters ────────────────────────────────────────
  static addDocument(doc: Document): Document {
    const existing = memoryCache.documents.findIndex((d) => d.id === doc.id);
    if (existing >= 0) {
      memoryCache.documents[existing] = doc;
    } else {
      memoryCache.documents.unshift(doc);
    }
    return doc;
  }

  static updateDocumentStatus(id: string, status: DocumentStatus, error?: string): void {
    const doc = memoryCache.documents.find((d) => d.id === id);
    if (doc) {
      doc.status = status;
      doc.processing_error = error ?? null;
      if (status === 'completed') doc.processing_completed_at = new Date().toISOString();
      doc.updated_at = new Date().toISOString();
    }
  }

  static deleteDocument(id: string): void {
    memoryCache.documents = memoryCache.documents.filter((d) => d.id !== id);
    memoryCache.extractedFields = memoryCache.extractedFields.filter((f) => f.document_id !== id);
    memoryCache.lineItems = memoryCache.lineItems.filter((li) => li.document_id !== id);
    memoryCache.findings = memoryCache.findings.filter(
      (f) => f.source_document_id !== id && f.compared_document_id !== id
    );
  }

  static addExtractedFields(fields: ExtractedField[]): void {
    const ids = new Set(fields.map((f) => f.id));
    memoryCache.extractedFields = [
      ...fields,
      ...memoryCache.extractedFields.filter((f) => !ids.has(f.id)),
    ];
  }

  static addLineItems(items: LineItem[]): void {
    const ids = new Set(items.map((li) => li.id));
    memoryCache.lineItems = [
      ...items,
      ...memoryCache.lineItems.filter((li) => !ids.has(li.id)),
    ];
  }

  static addReconciliationGroup(group: ReconciliationGroup): ReconciliationGroup {
    const existing = memoryCache.reconciliationGroups.findIndex((g) => g.id === group.id);
    if (existing >= 0) {
      memoryCache.reconciliationGroups[existing] = group;
    } else {
      memoryCache.reconciliationGroups.unshift(group);
    }
    return group;
  }

  // ── Asynchronous Server API Operations (Server is Single Source of Truth) ──

  static async fetchDocuments(category?: string, status?: string, q?: string): Promise<Document[]> {
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      if (status && status !== 'all') params.set('status', status);
      if (q) params.set('q', q);

      const res = await fetch(`/api/documents?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          memoryCache.documents = json.data;
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch documents from server:', err);
    }
    return memoryCache.documents;
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
          const doc = json.data.document;
          const fields = json.data.fields || [];
          const lineItems = json.data.lineItems || [];
          const findings = json.data.findings || [];

          if (doc) this.addDocument(doc);
          if (fields.length > 0) this.addExtractedFields(fields);
          if (lineItems.length > 0) this.addLineItems(lineItems);

          return { document: doc, fields, lineItems, findings };
        }
      }
    } catch (err) {
      console.error(`Failed to fetch document ${id} details:`, err);
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
    const res = await fetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, lineItems }),
    });
    const data = await res.json();
    if (res.ok && data.success && data.data) {
      this.addExtractedFields(data.data.fields);
      this.addLineItems(data.data.lineItems);
      return {
        success: true,
        fields: data.data.fields,
        lineItems: data.data.lineItems,
      };
    }
    throw new Error(data.error || 'Failed to update document data table');
  }

  static async reprocessDocumentApi(id: string): Promise<Document | null> {
    try {
      const res = await fetch(`/api/documents/${id}/process`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.document) {
          const doc = json.data.document;
          this.addDocument(doc);
          if (json.data.fields) this.addExtractedFields(json.data.fields);
          if (json.data.lineItems) this.addLineItems(json.data.lineItems);
          return doc;
        }
      }
    } catch (err) {
      console.error(`Failed to reprocess document ${id}:`, err);
    }
    return this.getDocumentById(id);
  }

  static async deleteDocumentApi(id: string): Promise<void> {
    try {
      await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(`Failed to delete document ${id}:`, err);
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
          memoryCache.findings = json.data;
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch findings:', err);
    }
    return memoryCache.findings;
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
    } catch (err) {
      console.error(`Failed to fetch finding ${id}:`, err);
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
          const updated = json.data as Finding;
          memoryCache.findings = memoryCache.findings.map((f) =>
            f.id === findingId ? updated : f
          );
          return updated;
        }
      }
    } catch (err) {
      console.error(`Failed to save review for finding ${findingId}:`, err);
    }
    return null;
  }

  static async fetchReconciliations(): Promise<ReconciliationGroup[]> {
    try {
      const res = await fetch('/api/reconciliation');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          memoryCache.reconciliationGroups = json.data;
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch reconciliations:', err);
    }
    return memoryCache.reconciliationGroups;
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
      const newIds = new Set(json.data.findings.map((f: Finding) => f.id));
      memoryCache.findings = [
        ...json.data.findings,
        ...memoryCache.findings.filter((f) => !newIds.has(f.id)),
      ];
    }

    return {
      group: json.data.group,
      findings: json.data.findings || [],
    };
  }

  static async fetchDashboardStats(): Promise<DashboardStats | null> {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          memoryCache.dashboardStats = json.data;
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    }
    return memoryCache.dashboardStats;
  }

  static async fetchAuditTrail(): Promise<{ auditEvents: AuditEvent[]; caseHistory: CaseHistoryItem[] }> {
    try {
      const res = await fetch('/api/audit-trail');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          if (Array.isArray(json.data.auditEvents)) memoryCache.auditEvents = json.data.auditEvents;
          if (Array.isArray(json.data.caseHistory)) memoryCache.caseHistory = json.data.caseHistory;
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit trail:', err);
    }
    return {
      auditEvents: memoryCache.auditEvents,
      caseHistory: memoryCache.caseHistory,
    };
  }

  static async verifyAuditChainApi(): Promise<ChainVerificationResult> {
    try {
      const res = await fetch('/api/audit-trail/verify');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return json.data;
        }
      }
    } catch (err) {
      console.error('Failed to verify audit chain:', err);
    }
    return { verified: false, count: 0, error: 'Verification network error' };
  }

  static async resetDemoDataApi(): Promise<void> {
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
    } catch (err) {
      console.error('Failed to reset demo data on server:', err);
    }
    this.resetDemoData();
  }

  static resetDemoData(): void {
    clearLegacyLocalStorage();
    memoryCache.documents = [];
    memoryCache.extractedFields = [];
    memoryCache.lineItems = [];
    memoryCache.reconciliationGroups = [];
    memoryCache.findings = [];
    memoryCache.auditEvents = [];
    memoryCache.caseHistory = [];
    memoryCache.dashboardStats = null;
  }
}
