'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Finding } from '@/lib/types';
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
  FileText,
  AlertTriangle,
  History,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewQueuePage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'reviewing' | 'resolved'>('accepted');
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const list = DataStore.getFindings();
    setFindings(list);
    if (list.length > 0) {
      const pending = list.find((f) => !f.is_reviewed && f.status !== 'resolved');
      setSelectedFindingId(pending ? pending.id : list[0].id);
    }

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

  const activeFinding = findings.find((f) => f.id === selectedFindingId) ?? findings[0] ?? null;

  const handleSaveReview = async () => {
    if (!activeFinding) return;
    setIsSaving(true);

    try {
      const updated = await DataStore.saveFindingReviewApi(
        activeFinding.id,
        decision,
        comments,
        'Gurumoorthy S'
      );
      if (updated) {
        setFindings((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      }
      setSuccessMessage('Review decision saved and recorded to audit trail.');
      setComments('');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const pendingQueue = findings.filter((f) => !f.is_reviewed && f.status !== 'resolved');

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Review Queue</h1>
          <p className="page-subtitle">
            Human-in-the-loop review workflow for resolving anomalies, approving tolerances, and documenting audit rationale.
          </p>
        </div>
        <div>
          <span className="badge badge-warning" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
            {pendingQueue.length} Pending Review
          </span>
        </div>
      </div>

      {/* Compliance Disclaimer Banner */}
      <div
        style={{
          background: 'var(--ds-info-bg)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: 'var(--ds-radius)',
          padding: '12px 18px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.82rem',
          color: 'var(--ds-info)',
        }}
      >
        <Shield size={20} style={{ flexShrink: 0 }} />
        <span>
          <strong>Assistance Notice:</strong> This review queue records human verification decisions for audit traceability. Completing a review does not authorize payment disbursements or release financial liabilities.
        </span>
      </div>

      {/* Layout Grid: Queue List on Left, Active Review Workspace on Right */}
      <div className="review-queue-layout">
        {/* Left: Queue Items List */}
        <div className="card" style={{ padding: 18, alignSelf: 'start' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 12 }}>
            Queue Items ({findings.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
            {findings.map((f) => {
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
                    <span className={`badge ${f.severity === 'high' ? 'badge-error' : 'badge-warning'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                      {f.severity}
                    </span>
                  </div>

                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--ds-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.title}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
                    <span>{f.financial_impact ? `₹ ${f.financial_impact.toLocaleString('en-IN')}` : 'Field check'}</span>
                    <span>{f.is_reviewed ? <span style={{ color: 'var(--ds-success)' }}>Reviewed</span> : <span style={{ color: 'var(--ds-warning)' }}>Pending</span>}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active Review Form (Matches Image 2 Screen 10) */}
        {activeFinding && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Finding Header Card */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className="badge badge-error" style={{ fontSize: '0.72rem' }}>
                      {activeFinding.severity.toUpperCase()} SEVERITY
                    </span>
                    <span className="badge">Finding ID: {activeFinding.id}</span>
                    <span className="badge badge-info">Status: {activeFinding.status.toUpperCase()}</span>
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

              <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', lineHeight: 1.6, margin: '0 0 16px 0' }}>
                {activeFinding.reason || activeFinding.description}
              </p>

              {/* Finding Method & Rule Metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)', marginBottom: 16 }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', display: 'block' }}>Rule ID:</span>
                  <strong style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--ds-text-primary)' }}>{activeFinding.rule_id || 'RULE_RECONCILIATION'}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', display: 'block' }}>Calculation Method:</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>{activeFinding.calculation_method || 'Deterministic comparison rule'}</span>
                </div>
                {activeFinding.financial_impact !== null && (
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', display: 'block' }}>Financial Impact / Variance:</span>
                    <strong style={{ color: 'var(--ds-error)', fontSize: '0.88rem' }}>
                      {activeFinding.currency || '₹'} {activeFinding.financial_impact?.toLocaleString('en-IN')}
                    </strong>
                  </div>
                )}
              </div>

              {/* Verified Evidence Passages */}
              {(activeFinding.source_text || activeFinding.compared_text) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16, fontSize: '0.8rem' }}>
                  {activeFinding.source_text && (
                    <div style={{ padding: '10px 12px', background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-muted)', marginBottom: 4 }}>
                        Source Document Passage (Page {activeFinding.source_page || 1}):
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--ds-text-primary)', whiteSpace: 'pre-wrap' }}>
                        &ldquo;{activeFinding.source_text}&rdquo;
                      </div>
                    </div>
                  )}
                  {activeFinding.compared_text && (
                    <div style={{ padding: '10px 12px', background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', borderRadius: 'var(--ds-radius)' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--ds-text-muted)', marginBottom: 4 }}>
                        Compared Document Passage (Page {activeFinding.compared_page || 1}):
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--ds-text-primary)', whiteSpace: 'pre-wrap' }}>
                        &ldquo;{activeFinding.compared_text}&rdquo;
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Add Your Review Card (Image 2 Screen 10) */}
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 16 }}>
                Add Your Review
              </h3>

              {successMessage && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--ds-radius)',
                    background: 'var(--ds-success-bg)',
                    color: 'var(--ds-success)',
                    fontSize: '0.85rem',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Check size={16} />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* 4 Review Options: Confirm, Dismiss, Investigate, Resolve */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, marginBottom: 20 }}>
                {/* Confirm */}
                <div
                  onClick={() => setDecision('accepted')}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'accepted' ? '2px solid var(--ds-teal-500)' : '1px solid var(--ds-border)',
                    background: decision === 'accepted' ? 'rgba(13, 148, 136, 0.05)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(13, 148, 136, 0.1)',
                      color: 'var(--ds-teal-500)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                    }}
                  >
                    <CheckCircle size={18} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text-primary)' }}>
                    Confirm
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                    Mark as valid finding
                  </div>
                </div>

                {/* Dismiss / Reject */}
                <div
                  onClick={() => setDecision('rejected')}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'rejected' ? '2px solid var(--ds-error)' : '1px solid var(--ds-border)',
                    background: decision === 'rejected' ? 'rgba(239, 68, 68, 0.05)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--ds-error)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                    }}
                  >
                    <XCircle size={18} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text-primary)' }}>
                    Dismiss
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                    Not an issue / rejected
                  </div>
                </div>

                {/* Investigate / In Review */}
                <div
                  onClick={() => setDecision('reviewing')}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'reviewing' ? '2px solid #eab308' : '1px solid var(--ds-border)',
                    background: decision === 'reviewing' ? 'rgba(234, 179, 8, 0.05)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(234, 179, 8, 0.1)',
                      color: '#eab308',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                    }}
                  >
                    <HelpCircle size={18} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text-primary)' }}>
                    Investigate
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                    Needs review context
                  </div>
                </div>

                {/* Resolve / Remediate */}
                <div
                  onClick={() => setDecision('resolved')}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--ds-radius)',
                    border: decision === 'resolved' ? '2px solid var(--ds-success)' : '1px solid var(--ds-border)',
                    background: decision === 'resolved' ? 'rgba(34, 197, 94, 0.05)' : 'var(--ds-surface)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(34, 197, 94, 0.1)',
                      color: 'var(--ds-success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                    }}
                  >
                    <Check size={18} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text-primary)' }}>
                    Resolve
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                    Remediate & close
                  </div>
                </div>
              </div>

              {/* Commentary */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Review Commentary & Audit Notes</label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Add your commentary or internal compliance reason here..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleSaveReview}
                  className="btn btn-primary"
                  disabled={isSaving}
                  style={{ padding: '8px 24px' }}
                >
                  {isSaving ? 'Saving Review...' : 'Save Review'}
                </button>
              </div>
            </div>

            {/* Review History Card */}
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 14 }}>
                Review History & Log
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-teal-500)', marginTop: 6 }} />
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                      Finding generated by Reconciliation Engine
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
                      {format(new Date(activeFinding.created_at), 'MMM d, yyyy HH:mm:ss')} • System ({activeFinding.rule_id || 'Deterministic Engine'})
                    </div>
                  </div>
                </div>

                {activeFinding.decision_history && activeFinding.decision_history.length > 0 ? (
                  activeFinding.decision_history.map((dh, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            dh.decision === 'accepted'
                              ? 'var(--ds-teal-500)'
                              : dh.decision === 'rejected'
                              ? 'var(--ds-error)'
                              : dh.decision === 'resolved'
                              ? 'var(--ds-success)'
                              : '#eab308',
                          marginTop: 6,
                        }}
                      />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                          Reviewed by {dh.reviewer || dh.reviewed_by || 'Reviewer'} • Decision: {dh.decision.toUpperCase()}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', margin: '2px 0 0 0' }}>
                          &ldquo;{dh.comments || 'No comment provided'}&rdquo;
                        </p>
                        <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                          {format(new Date(dh.timestamp || dh.reviewed_at || new Date().toISOString()), 'MMM d, yyyy HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                  ))
                ) : activeFinding.is_reviewed ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-success)', marginTop: 6 }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                        Reviewed by {activeFinding.reviewed_by || 'Gurumoorthy S'} • Status: {activeFinding.status.toUpperCase()}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', margin: '2px 0 0 0' }}>
                        &ldquo;{activeFinding.review_comments || 'Approved with note'}&rdquo;
                      </p>
                      <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                        {activeFinding.reviewed_at ? format(new Date(activeFinding.reviewed_at), 'MMM d, yyyy HH:mm:ss') : 'Recently'}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
