'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Finding } from '@/lib/types';
import { generateVendorDisputeLetter, type DisputeLetter } from '@/lib/reconciliation/dispute';
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  HelpCircle,
  Clock,
  MessageSquare,
  Shield,
  ArrowRight,
  Eye,
  History,
  Check,
  Send,
  ShieldAlert,
  Copy,
  Download,
  FileWarning,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewQueuePage() {
  const { profile } = useAuth();
  const [findings, setFindings] = useState<Finding[]>(() => DataStore.getFindings());
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'disputed' | 'escalated' | 'resolved'>('pending');
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'reviewing' | 'resolved' | 'disputed' | 'escalated'>('accepted');
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [activeDisputeLetter, setActiveDisputeLetter] = useState<DisputeLetter | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    DataStore.fetchFindings()
      .then((serverList) => {
        if (serverList && serverList.length > 0) {
          setFindings(serverList);
          setSelectedFindingId((prev) => {
            if (prev && serverList.some((f) => f.id === prev)) return prev;
            const pending = serverList.find((f) => !f.is_reviewed && f.status !== 'resolved');
            return pending ? pending.id : serverList[0].id;
          });
        }
      })
      .catch((err) => console.error('Failed to fetch findings:', err));
  }, []);

  const pendingQueue = findings.filter((f) => !f.is_reviewed && f.status !== 'resolved');
  const disputedQueue = findings.filter((f) => f.status === 'disputed' || f.review_decision === 'disputed');
  const escalatedQueue = findings.filter((f) => f.status === 'escalated' || f.review_decision === 'escalated');
  const resolvedQueue = findings.filter((f) => f.status === 'resolved' || f.status === 'accepted' || f.status === 'rejected');

  const filteredFindings = findings.filter((f) => {
    if (statusFilter === 'pending') return !f.is_reviewed && f.status !== 'resolved';
    if (statusFilter === 'disputed') return f.status === 'disputed' || f.review_decision === 'disputed';
    if (statusFilter === 'escalated') return f.status === 'escalated' || f.review_decision === 'escalated';
    if (statusFilter === 'resolved') return f.status === 'resolved' || f.status === 'accepted' || f.status === 'rejected';
    return true;
  });

  const activeFinding = findings.find((f) => f.id === selectedFindingId) ?? filteredFindings[0] ?? findings[0] ?? null;

  // Sync active finding with dispute letter generator
  useEffect(() => {
    if (activeFinding && (decision === 'disputed' || activeFinding.status === 'disputed')) {
      const letter = generateVendorDisputeLetter({
        finding: activeFinding,
        organizationName: 'Finance Controls & Compliance Division',
        senderName: profile?.full_name || 'Senior Commercial Reviewer',
      });
      setActiveDisputeLetter(letter);
    }
  }, [activeFinding, decision, profile?.full_name]);

  const handleSaveReview = async () => {
    if (!activeFinding) return;
    setIsSaving(true);

    try {
      const updated = await DataStore.saveFindingReviewApi(
        activeFinding.id,
        decision,
        comments,
        profile?.full_name || 'Reviewer'
      );
      if (updated) {
        setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        if (updated.disputeLetter) {
          setActiveDisputeLetter(updated.disputeLetter);
        }
      }
      setSuccessMessage(
        decision === 'disputed'
          ? 'Finding marked as DISPUTED. Formal Vendor Dispute Memo generated below.'
          : decision === 'escalated'
          ? 'Finding ESCALATED to Finance Controller for priority executive review.'
          : 'Review decision saved and recorded to immutable audit trail.'
      );
      setComments('');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyDispute = () => {
    if (!activeDisputeLetter) return;
    navigator.clipboard.writeText(activeDisputeLetter.bodyText);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  const handleDownloadDispute = () => {
    if (!activeDisputeLetter) return;
    const blob = new Blob([activeDisputeLetter.bodyText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vendor_Dispute_${activeDisputeLetter.referenceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Review Queue & Dispute Management</h1>
          <p className="page-subtitle">
            Human-in-the-loop review workflow for approving tolerances, returning non-compliant invoices, and issuing vendor dispute notices.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            {pendingQueue.length} Pending
          </span>
          {disputedQueue.length > 0 && (
            <span className="badge badge-error" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
              {disputedQueue.length} Disputed
            </span>
          )}
          {escalatedQueue.length > 0 && (
            <span className="badge badge-info" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
              {escalatedQueue.length} Escalated
            </span>
          )}
        </div>
      </div>

      {/* Compliance Disclaimer Banner */}
      <div
        style={{
          background: 'var(--ds-info-bg)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: 'var(--ds-radius)',
          padding: '12px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.82rem',
          color: 'var(--ds-info)',
        }}
      >
        <Shield size={20} style={{ flexShrink: 0 }} />
        <span>
          <strong>Audit Traceability:</strong> All review decisions, overrides, vendor dispute letters, and escalation notes are cryptographically linked to the SHA-256 audit log.
        </span>
      </div>

      {successMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 8,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: '0.88rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CheckCircle size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Layout Grid: Queue List on Left, Active Review Workspace on Right */}
      <div className="review-queue-layout">
        {/* Left: Queue Items List */}
        <div className="card" style={{ padding: 18, alignSelf: 'start' }}>
          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`btn btn-sm ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              Pending ({pendingQueue.length})
            </button>
            <button
              onClick={() => setStatusFilter('disputed')}
              className={`btn btn-sm ${statusFilter === 'disputed' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              Disputed ({disputedQueue.length})
            </button>
            <button
              onClick={() => setStatusFilter('escalated')}
              className={`btn btn-sm ${statusFilter === 'escalated' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              Escalated ({escalatedQueue.length})
            </button>
            <button
              onClick={() => setStatusFilter('resolved')}
              className={`btn btn-sm ${statusFilter === 'resolved' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              Resolved ({resolvedQueue.length})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 8px', fontSize: '0.72rem' }}
            >
              All ({findings.length})
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 580, overflowY: 'auto' }}>
            {filteredFindings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No findings in this category.
              </div>
            ) : (
              filteredFindings.map((f) => {
                const isSelected = f.id === activeFinding?.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      setSelectedFindingId(f.id);
                      setSuccessMessage('');
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--ds-radius)',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(13, 148, 136, 0.08)' : 'var(--ds-bg)',
                      border: isSelected ? '1px solid var(--ds-teal-500)' : '1px solid var(--ds-border-light)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--ds-teal-500)' }}>
                        {f.id}
                      </span>
                      <span
                        className={`badge ${
                          f.severity === 'critical'
                            ? 'badge-error'
                            : f.severity === 'high'
                            ? 'badge-error'
                            : 'badge-warning'
                        }`}
                        style={{ fontSize: '0.68rem', padding: '1px 6px' }}
                      >
                        {f.severity}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--ds-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.title}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
                      <span>
                        {f.financial_impact !== undefined && f.financial_impact !== null
                          ? `${f.currency || 'USD'} ${Math.abs(f.financial_impact).toLocaleString()}`
                          : 'Rule flag'}
                      </span>
                      <span>
                        {f.status === 'disputed' ? (
                          <span style={{ color: '#ea580c', fontWeight: 600 }}>Disputed</span>
                        ) : f.status === 'escalated' ? (
                          <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Escalated</span>
                        ) : f.is_reviewed ? (
                          <span style={{ color: 'var(--ds-success)' }}>Reviewed</span>
                        ) : (
                          <span style={{ color: 'var(--ds-warning)' }}>Pending</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Review Workspace */}
        {activeFinding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Finding Header Card */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      className={`badge ${
                        activeFinding.severity === 'critical'
                          ? 'badge-error'
                          : activeFinding.severity === 'high'
                          ? 'badge-error'
                          : 'badge-warning'
                      }`}
                      style={{ fontSize: '0.72rem' }}
                    >
                      {activeFinding.severity.toUpperCase()} SEVERITY
                    </span>
                    <span className="badge">Finding ID: {activeFinding.id}</span>
                    <span className="badge badge-info">Status: {activeFinding.status.toUpperCase()}</span>
                    {activeFinding.rule_id && (
                      <span className="badge" style={{ fontFamily: 'monospace' }}>
                        {activeFinding.rule_id}
                      </span>
                    )}
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                    {activeFinding.title}
                  </h2>
                </div>

                <Link
                  href={`/findings/${activeFinding.id}`}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  <Eye size={14} />
                  <span>Inspect Evidence</span>
                </Link>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--ds-text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                {activeFinding.description}
              </p>

              {/* Source vs Compared Values Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, background: 'var(--ds-bg)', padding: 14, borderRadius: 'var(--ds-radius)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Invoiced Claimed
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ds-text-primary)', marginTop: 2, fontFamily: 'monospace' }}>
                    {activeFinding.source_value || '—'}
                  </div>
                  {activeFinding.source_page && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--ds-teal-500)', marginTop: 2 }}>
                      Verified on Page {activeFinding.source_page}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Authorized PO / Contract
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ds-text-primary)', marginTop: 2, fontFamily: 'monospace' }}>
                    {activeFinding.compared_value || '—'}
                  </div>
                  {activeFinding.compared_page && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--ds-teal-500)', marginTop: 2 }}>
                      Verified on Page {activeFinding.compared_page}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Variance / Impact
                  </div>
                  <div
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      marginTop: 2,
                      fontFamily: 'monospace',
                      color: activeFinding.variance && activeFinding.variance > 0 ? 'var(--ds-error)' : 'var(--ds-success)',
                    }}
                  >
                    {activeFinding.variance !== undefined && activeFinding.variance !== null
                      ? `${activeFinding.currency || 'USD'} ${Math.abs(activeFinding.variance).toLocaleString()}`
                      : activeFinding.financial_impact
                      ? `${activeFinding.currency || 'USD'} ${Math.abs(activeFinding.financial_impact).toLocaleString()}`
                      : 'Non-monetary'}
                  </div>
                </div>
              </div>
            </div>

            {/* Review Decision Workspace */}
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: '0 0 16px 0' }}>
                Determine Review & Remediation Action
              </h3>

              {/* 6 Action Options Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {/* 1: Accept / Tolerate */}
                <div
                  onClick={() => setDecision('accepted')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'accepted' ? '2px solid var(--ds-teal-500)' : '1px solid var(--ds-border)',
                    background: decision === 'accepted' ? 'rgba(13, 148, 136, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(13, 148, 136, 0.1)', color: 'var(--ds-teal-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <CheckCircle size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Approve / Tolerate</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Accept commercial variance</div>
                </div>

                {/* 2: Reject Invoice */}
                <div
                  onClick={() => setDecision('rejected')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'rejected' ? '2px solid var(--ds-error)' : '1px solid var(--ds-border)',
                    background: decision === 'rejected' ? 'rgba(239, 68, 68, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--ds-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <XCircle size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Reject Invoice</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Return invoice to vendor</div>
                </div>

                {/* 3: Raise Vendor Dispute */}
                <div
                  onClick={() => setDecision('disputed')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'disputed' ? '2px solid #ea580c' : '1px solid var(--ds-border)',
                    background: decision === 'disputed' ? 'rgba(234, 88, 12, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <FileWarning size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Raise Vendor Dispute</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Generate formal credit memo notice</div>
                </div>

                {/* 4: Escalate to Controller */}
                <div
                  onClick={() => setDecision('escalated')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'escalated' ? '2px solid #8b5cf6' : '1px solid var(--ds-border)',
                    background: decision === 'escalated' ? 'rgba(139, 92, 246, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <ShieldAlert size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Escalate to Controller</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Executive financial sign-off</div>
                </div>

                {/* 5: Investigate */}
                <div
                  onClick={() => setDecision('reviewing')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'reviewing' ? '2px solid #eab308' : '1px solid var(--ds-border)',
                    background: decision === 'reviewing' ? 'rgba(234, 179, 8, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <HelpCircle size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Investigate</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Gather internal context</div>
                </div>

                {/* 6: Resolve & Close */}
                <div
                  onClick={() => setDecision('resolved')}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'resolved' ? '2px solid var(--ds-success)' : '1px solid var(--ds-border)',
                    background: decision === 'resolved' ? 'rgba(34, 197, 94, 0.08)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: 'var(--ds-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                    <Check size={16} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>Resolve & Close</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>Remediation completed</div>
                </div>
              </div>

              {/* Commentary */}
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  Review Commentary & Rationale (Mandatory for audit trail)
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Document specific business rationale, change order references, or vendor communication..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  onClick={handleSaveReview}
                  className="btn btn-primary"
                  disabled={isSaving}
                  style={{ padding: '8px 24px' }}
                >
                  {isSaving ? 'Recording Review...' : 'Submit Review Decision'}
                </button>
              </div>
            </div>

            {/* Vendor Dispute Memo Preview Card */}
            {(decision === 'disputed' || activeFinding.status === 'disputed') && activeDisputeLetter && (
              <div className="card" style={{ padding: 24, border: '1px solid #fdba74', background: '#fffbeb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#9a3412', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Send size={18} />
                      <span>Formal Vendor Dispute Memo Generated</span>
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#b45309' }}>
                      Ready for Accounts Payable communication. Pre-populated with verified line items and contract citations.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleCopyDispute}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#fff' }}
                    >
                      <Copy size={14} />
                      <span>{copySuccess ? 'Copied!' : 'Copy Memo'}</span>
                    </button>
                    <button
                      onClick={handleDownloadDispute}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#fff' }}
                    >
                      <Download size={14} />
                      <span>Download .txt</span>
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #fed7aa',
                    borderRadius: 6,
                    padding: 16,
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                    color: '#334155',
                  }}
                >
                  {activeDisputeLetter.bodyText}
                </div>
              </div>
            )}

            {/* Review History Card */}
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={16} />
                <span>Audit & Decision History</span>
              </h3>

              {activeFinding.decision_history && activeFinding.decision_history.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activeFinding.decision_history.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--ds-bg)',
                        borderRadius: 'var(--ds-radius)',
                        borderLeft: '3px solid var(--ds-teal-500)',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--ds-teal-500)' }}>
                          {h.decision}
                        </span>
                        <span style={{ color: 'var(--ds-text-muted)' }}>
                          {h.timestamp || h.reviewed_at ? format(new Date(h.timestamp || h.reviewed_at!), 'MMM d, yyyy HH:mm') : '—'}
                        </span>
                      </div>
                      <div style={{ color: 'var(--ds-text-primary)' }}>{h.comments || 'No comment provided.'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 4 }}>
                        Reviewer: {h.reviewer || h.reviewed_by || 'Auditor'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', fontStyle: 'italic' }}>
                  No prior review decisions recorded. This finding is currently pending initial determination.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
