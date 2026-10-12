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
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'reviewing'>('accepted');
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const list = DataStore.getFindings();
    setFindings(list);
    if (list.length > 0) {
      // Pick first unreviewed or first finding
      const pending = list.find((f) => !f.is_reviewed && f.status !== 'resolved');
      setSelectedFindingId(pending ? pending.id : list[0].id);
    }
  }, []);

  const activeFinding = findings.find((f) => f.id === selectedFindingId) ?? findings[0] ?? null;

  const handleSaveReview = () => {
    if (!activeFinding) return;
    setIsSaving(true);

    setTimeout(() => {
      DataStore.updateFindingReview(
        activeFinding.id,
        decision,
        comments,
        'Gurumoorthy S'
      );
      const updatedList = DataStore.getFindings();
      setFindings(updatedList);
      setIsSaving(false);
      setSuccessMessage('Review decision saved successfully.');
      setComments('');

      setTimeout(() => setSuccessMessage(''), 3000);
    }, 600);
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
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

              {activeFinding.financial_impact !== null && (
                <div style={{ display: 'flex', gap: 16, background: 'var(--ds-bg)', padding: '10px 16px', borderRadius: 'var(--ds-radius)' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>Variance:</span>{' '}
                    <strong style={{ color: 'var(--ds-error)' }}>₹ {activeFinding.financial_impact?.toLocaleString('en-IN')}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>Document:</span>{' '}
                    <strong>{activeFinding.source_document_id || 'INV-5112.pdf'}</strong>
                  </div>
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

              {/* 3 Review Options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
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

                {/* Dismiss */}
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
                    Not an issue / tolerated
                  </div>
                </div>

                {/* Investigate */}
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
                    Needs more context
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
                      {format(new Date(activeFinding.created_at), 'MMM d, yyyy HH:mm:ss')} • System
                    </div>
                  </div>
                </div>

                {activeFinding.is_reviewed && (
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
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
