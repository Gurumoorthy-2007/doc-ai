import { createServerSupabase } from '@/lib/supabase/server';
import type {
  Document,
  ExtractedField,
  LineItem,
  ReconciliationGroup,
  Finding,
  FindingStatus,
  DashboardStats,
  AuditEvent,
} from '@/lib/types';
import type { CaseHistoryItem } from '@/lib/data/seedData';
import {
  signAuditEvent,
  verifyAuditChain,
  GENESIS_PREV_HASH,
  type ChainVerificationResult,
} from '@/lib/server/auditChain';
import type { IRepository, FindingReviewDecision } from './types';

export class SupabaseRepository implements IRepository {
  private getClient() {
    return createServerSupabase();
  }

  async getDocuments(userId?: string): Promise<Document[]> {
    const supabase = this.getClient();
    let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase getDocuments error: ${error.message}`);
    return (data || []) as Document[];
  }

  async getDocumentById(id: string): Promise<Document | null> {
    const supabase = this.getClient();
    const { data, error } = await supabase.from('documents').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getDocumentById error: ${error.message}`);
    return (data as Document) || null;
  }

  async getDocumentByHash(fileHash: string): Promise<Document | null> {
    const supabase = this.getClient();
    const { data, error } = await supabase.from('documents').select('*').eq('file_hash', fileHash).maybeSingle();
    if (error) throw new Error(`Supabase getDocumentByHash error: ${error.message}`);
    return (data as Document) || null;
  }

  async createDocument(doc: Document): Promise<Document> {
    const supabase = this.getClient();
    const { data, error } = await supabase.from('documents').upsert(doc).select().single();
    if (error) throw new Error(`Supabase createDocument error: ${error.message}`);
    return (data as Document) || doc;
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | null> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Supabase updateDocument error: ${error.message}`);
    return (data as Document) || null;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const supabase = this.getClient();
    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) throw new Error(`Supabase deleteDocument error: ${error.message}`);
    return true;
  }

  async getExtractedFields(documentId?: string): Promise<ExtractedField[]> {
    const supabase = this.getClient();
    let query = supabase.from('extracted_fields').select('*');
    if (documentId) {
      query = query.eq('document_id', documentId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase getExtractedFields error: ${error.message}`);
    return (data || []) as ExtractedField[];
  }

  async saveExtractedFields(documentId: string, fields: ExtractedField[]): Promise<void> {
    const supabase = this.getClient();
    // Delete existing fields for this document
    await supabase.from('extracted_fields').delete().eq('document_id', documentId);
    if (fields.length > 0) {
      const records = fields.map((f, i) => ({
        ...f,
        id: f.id || `field-${documentId}-${i + 1}`,
        document_id: documentId,
        created_at: f.created_at || new Date().toISOString(),
      }));
      const { error } = await supabase.from('extracted_fields').insert(records);
      if (error) throw new Error(`Supabase saveExtractedFields error: ${error.message}`);
    }
  }

  async getLineItems(documentId?: string): Promise<LineItem[]> {
    const supabase = this.getClient();
    let query = supabase.from('line_items').select('*').order('item_number', { ascending: true });
    if (documentId) {
      query = query.eq('document_id', documentId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase getLineItems error: ${error.message}`);
    return (data || []) as LineItem[];
  }

  async saveLineItems(documentId: string, items: LineItem[]): Promise<void> {
    const supabase = this.getClient();
    await supabase.from('line_items').delete().eq('document_id', documentId);
    if (items.length > 0) {
      const records = items.map((li, i) => ({
        ...li,
        id: li.id || `li-${documentId}-${i + 1}`,
        document_id: documentId,
        created_at: li.created_at || new Date().toISOString(),
      }));
      const { error } = await supabase.from('line_items').insert(records);
      if (error) throw new Error(`Supabase saveLineItems error: ${error.message}`);
    }
  }

  async getReconciliationGroups(userId?: string): Promise<ReconciliationGroup[]> {
    const supabase = this.getClient();
    let query = supabase.from('reconciliation_groups').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase getReconciliationGroups error: ${error.message}`);
    return (data || []) as ReconciliationGroup[];
  }

  async getReconciliationGroupById(id: string): Promise<ReconciliationGroup | null> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('reconciliation_groups')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Supabase getReconciliationGroupById error: ${error.message}`);
    return (data as ReconciliationGroup) || null;
  }

  async saveReconciliationGroup(group: ReconciliationGroup): Promise<ReconciliationGroup> {
    const supabase = this.getClient();
    const { data, error } = await supabase.from('reconciliation_groups').upsert(group).select().single();
    if (error) throw new Error(`Supabase saveReconciliationGroup error: ${error.message}`);
    return (data as ReconciliationGroup) || group;
  }

  async saveReconciliationGroups(groups: ReconciliationGroup[]): Promise<void> {
    const supabase = this.getClient();
    if (groups.length > 0) {
      const { error } = await supabase.from('reconciliation_groups').upsert(groups);
      if (error) throw new Error(`Supabase saveReconciliationGroups error: ${error.message}`);
    }
  }

  async getFindings(userId?: string): Promise<Finding[]> {
    const supabase = this.getClient();
    let query = supabase.from('findings').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase getFindings error: ${error.message}`);
    return (data || []) as Finding[];
  }

  async getFindingById(id: string): Promise<Finding | null> {
    const supabase = this.getClient();
    const { data, error } = await supabase.from('findings').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase getFindingById error: ${error.message}`);
    return (data as Finding) || null;
  }

  async saveFindings(findings: Finding[]): Promise<void> {
    const supabase = this.getClient();
    if (findings.length > 0) {
      const { error } = await supabase.from('findings').upsert(findings);
      if (error) throw new Error(`Supabase saveFindings error: ${error.message}`);
    }
  }

  async updateFindingReview(
    findingId: string,
    decision: FindingReviewDecision,
    comments: string,
    reviewerName: string = 'Demo Reviewer',
    reviewerEmail?: string
  ): Promise<Finding | null> {
    const supabase = this.getClient();
    const finding = await this.getFindingById(findingId);
    if (!finding) return null;

    const nextStatus: FindingStatus =
      decision === 'accepted'
        ? 'accepted'
        : decision === 'rejected'
        ? 'rejected'
        : decision === 'resolved'
        ? 'resolved'
        : 'in_review';

    const history = finding.decision_history ? [...finding.decision_history] : [];
    history.push({
      decision,
      comments: comments || 'No commentary provided',
      reviewer: reviewerName,
      reviewed_by: reviewerName,
      timestamp: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
    });

    const updates = {
      status: nextStatus,
      is_reviewed: decision !== 'reviewing',
      reviewed_by: reviewerName,
      reviewed_at: new Date().toISOString(),
      review_decision: decision,
      review_comments: comments,
      decision_history: history,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('findings')
      .update(updates)
      .eq('id', findingId)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Supabase updateFindingReview error: ${error.message}`);

    await this.addAuditEvent({
      user_name: reviewerName,
      user_email: reviewerEmail || 'demo@docusentinel.local',
      action: 'Finding Reviewed',
      entity_type: 'finding',
      entity_id: findingId,
      entity_title: finding.title,
      details: `Decision: ${decision.toUpperCase()}. Comment: ${comments || 'No comment provided'}. Status changed to ${nextStatus}. (Notice: Human-in-the-loop review only; does not authorize payment).`,
    });

    return (data as Finding) || null;
  }

  async getAuditEvents(): Promise<AuditEvent[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Supabase getAuditEvents error: ${error.message}`);
    return (data || []) as AuditEvent[];
  }

  async addAuditEvent(
    event: Omit<AuditEvent, 'id' | 'created_at' | 'hash' | 'prev_hash'>
  ): Promise<AuditEvent> {
    const supabase = this.getClient();

    // Fetch the most recent event hash
    const { data: latest } = await supabase
      .from('audit_events')
      .select('hash')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevHash = latest?.hash || GENESIS_PREV_HASH;
    const unhashed = {
      ...event,
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };

    const signed = signAuditEvent(prevHash, unhashed);

    const { data, error } = await supabase.from('audit_events').insert(signed).select().single();
    if (error) throw new Error(`Supabase addAuditEvent error: ${error.message}`);
    return (data as AuditEvent) || signed;
  }

  async verifyAuditChain(): Promise<ChainVerificationResult> {
    const events = await this.getAuditEvents();
    return verifyAuditChain(events);
  }

  async getCaseHistory(): Promise<CaseHistoryItem[]> {
    return [];
  }

  async getDashboardStats(): Promise<DashboardStats> {
    const docs = await this.getDocuments();
    const findings = await this.getFindings();
    const recons = await this.getReconciliationGroups();
    const auditEvents = await this.getAuditEvents();

    const total_documents = docs.length;
    const processed_documents = docs.filter((d) => d.status === 'completed').length;
    const pending_documents = docs.filter(
      (d) => d.status === 'uploading' || d.status === 'uploaded' || d.status === 'processing'
    ).length;
    const error_documents = docs.filter((d) => d.status === 'error').length;
    const processing_rate =
      total_documents > 0 ? Math.round((processed_documents / total_documents) * 100) : 100;

    const total_findings = findings.length;
    const critical_findings = findings.filter((f) => f.severity === 'critical').length;
    const high_findings = findings.filter((f) => f.severity === 'high').length;
    const medium_findings = findings.filter((f) => f.severity === 'medium').length;
    const low_findings = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;
    const open_findings = findings.filter((f) => f.status === 'open').length;
    const in_review_findings = findings.filter(
      (f) => f.status === 'in_review' || f.status === 'reviewing'
    ).length;
    const resolved_findings = findings.filter((f) => f.status === 'resolved').length;
    const rejected_findings = findings.filter((f) => f.status === 'rejected').length;
    const accepted_findings = findings.filter((f) => f.status === 'accepted').length;
    const pendingReview = findings.filter(
      (f) => !f.is_reviewed && f.status !== 'resolved' && f.status !== 'accepted' && f.status !== 'rejected'
    ).length;

    const total_reconciliations = recons.length;
    const matched_reconciliations = recons.filter((r) => r.status === 'matched').length;
    const discrepancy_reconciliations = recons.filter((r) => r.status === 'discrepancy').length;
    const missing_reconciliations = recons.filter(
      (r) => r.status === 'missing_po' || r.status === 'missing_invoice'
    ).length;
    const reconciliation_accuracy =
      total_reconciliations > 0
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
      recent_activity: auditEvents.slice(0, 10),
      recentFindings: findings.slice(0, 5),
      recentAuditEvents: auditEvents.slice(0, 10),
      recentReconciliations: recons.slice(0, 5),
      processing_trend: [],
    } as unknown as DashboardStats;
  }

  async canUserAccessDocument(userId?: string, docId?: string, userRole?: string): Promise<boolean> {
    if (!docId) return false;
    if (!userId) return false;
    if (userRole === 'admin' || userRole === 'reviewer' || userId === 'usr-demo-admin-001') {
      return true;
    }
    const doc = await this.getDocumentById(docId);
    if (!doc) return false;
    return doc.user_id === userId;
  }

  async canUserAccessFinding(userId?: string, findingId?: string, userRole?: string): Promise<boolean> {
    if (!findingId) return false;
    if (!userId) return false;
    if (userRole === 'admin' || userRole === 'reviewer' || userId === 'usr-demo-admin-001') {
      return true;
    }
    const finding = await this.getFindingById(findingId);
    if (!finding) return false;
    return finding.user_id === userId;
  }

  async resetData(): Promise<void> {
    // No-op or truncate for Supabase
  }
}
