'use client';

import { Suspense, useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Finding } from '@/lib/types';
import {
  ArrowLeft,
  AlertTriangle,
  GitCompareArrows,
  ExternalLink,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Calendar,
  MessageSquare,
  Shield,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';

function EvidenceViewerContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [finding, setFinding] = useState<Finding | null>(null);
  const [activeTab, setActiveTab] = useState<'evidence' | 'details'>('evidence');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(2);
  const [totalPages, setTotalPages] = useState(5);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'accepted' | 'rejected' | 'reviewing'>('accepted');
  const [reviewComment, setReviewComment] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);

  useEffect(() => {
    const f = DataStore.getFindingById(resolvedParams.id);
    setFinding(f);
    if (f?.source_page) {
      setCurrentPage(f.source_page);
    }
  }, [resolvedParams.id]);

  const handleSaveReview = () => {
    if (!finding) return;
    setIsSavingReview(true);

    setTimeout(() => {
      const updated = DataStore.updateFindingReview(
        finding.id,
        reviewDecision,
        reviewComment,
        'Gurumoorthy S'
      );
      if (updated) {
        setFinding(updated);
      }
      setIsSavingReview(false);
      setShowReviewModal(false);
    }, 600);
  };

  if (!finding) {
    return (
      <AppShell>
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <AlertTriangle size={48} style={{ color: 'var(--ds-text-muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
            Finding Not Found
          </h2>
          <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 20 }}>
            Finding ID {resolvedParams.id} could not be found.
          </p>
          <Link href="/findings" className="btn btn-primary">
            Back to Findings
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/findings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.82rem',
            color: 'var(--ds-teal-500)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to Findings</span>
        </Link>
      </div>

      {/* Main Finding Banner (Matches Image 1 bottom right and Image 2 Screen 9) */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: finding.severity === 'high' ? 'var(--ds-error-bg)' : 'var(--ds-warning-bg)',
                  color: finding.severity === 'high' ? 'var(--ds-error)' : 'var(--ds-warning)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {finding.severity.toUpperCase()} SEVERITY
              </span>
              <span className="badge">Finding ID: {finding.id}</span>
              <span className="badge badge-info">Status: {finding.status.toUpperCase()}</span>
            </div>

            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: '0 0 6px 0' }}>
              {finding.title}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', margin: 0, maxWidth: 680 }}>
              {finding.description}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/reconciliation" className="btn btn-secondary">
              <GitCompareArrows size={14} />
              <span>View in Reconciliation</span>
            </Link>

            <button
              onClick={() => setShowReviewModal(true)}
              className="btn btn-primary"
            >
              <CheckCircle size={14} />
              <span>Submit Review</span>
            </button>
          </div>
        </div>

        {/* Financial Variance Callouts */}
        {finding.financial_impact !== null && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid var(--ds-border-light)',
            }}
          >
            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Variance Amount</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-error)' }}>
                ₹ {finding.financial_impact?.toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Document Billed Amount</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
                ₹ {parseFloat(finding.source_value || '0').toLocaleString('en-IN') || '68,750.00'}
              </div>
            </div>

            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>PO Approved Amount</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
                ₹ {parseFloat(finding.compared_value || '0').toLocaleString('en-IN') || '88,500.00'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ds-border)', marginBottom: 20, gap: 24 }}>
        <button
          onClick={() => setActiveTab('evidence')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'evidence' ? 600 : 500,
            color: activeTab === 'evidence' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'evidence' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Evidence Document View
        </button>

        <button
          onClick={() => setActiveTab('details')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'details' ? 600 : 500,
            color: activeTab === 'details' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'details' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Verification Details & Audit Trail
        </button>
      </div>

      {/* Tab 1: Evidence Split View (Matches Image 1 bottom right) */}
      {activeTab === 'evidence' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 24 }}>
          {/* Left: Original Document Viewer */}
          <div className="card" style={{ padding: 20 }}>
            {/* Document Controls Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: '1px solid var(--ds-border-light)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={18} color="var(--ds-teal-500)" />
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                  {finding.source_document_id ? `${finding.source_document_id}.pdf` : 'INV-5112.pdf'}
                </span>
                <span className="badge badge-info">Page {currentPage} of {totalPages}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                  className="icon-btn"
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', minWidth: 42, textAlign: 'center' }}>
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                  className="icon-btn"
                  title="Zoom In"
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            {/* Document Canvas with Highlighting */}
            <div
              style={{
                background: '#fafafa',
                border: '1px solid var(--ds-border)',
                borderRadius: 'var(--ds-radius)',
                padding: '28px 32px',
                minHeight: 460,
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease',
              }}
            >
              <div
                style={{
                  background: 'white',
                  padding: 24,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  lineHeight: 1.8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: 10, marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'sans-serif' }}>METRO SUPPLIES PVT LTD</h3>
                    <div>Tax Invoice • GSTIN: 27AABCS1429B1Z8</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>Invoice No: <strong>INV-5112</strong></div>
                    <div>Date: Apr 18, 2025</div>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div>Billed To: ABC Tech India Operations</div>
                  <div>PO Reference: <strong>PO-13001</strong></div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ccc' }}>
                      <th style={{ textAlign: 'left', padding: 4 }}>Description</th>
                      <th style={{ textAlign: 'right', padding: 4 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: 4 }}>Rate</th>
                      <th style={{ textAlign: 'right', padding: 4 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: 4 }}>Executive High-Back Chairs</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>10</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>6,500.00</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>65,000.00</td>
                    </tr>
                    <tr>
                      <td style={{ padding: 4 }}>GST (18%) Freight</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>1</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>3,750.00</td>
                      <td style={{ textAlign: 'right', padding: 4 }}>3,750.00</td>
                    </tr>
                  </tbody>
                </table>

                {/* HIGHLIGHTED EVIDENCE BOX */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    borderTop: '2px solid #333',
                    paddingTop: 10,
                  }}
                >
                  <div
                    style={{
                      background: '#fee2e2',
                      border: '2px solid #ef4444',
                      borderRadius: 4,
                      padding: '6px 14px',
                      boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>
                      Flagged Discrepancy Field
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#b91c1c' }}>
                      Total Amount: ₹ 68,750.00
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Evidence Inspection & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Extracted Values Cross-Reference */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>
                Evidence Grounding
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Extracted Value:</span>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ds-error)' }}>
                    ₹ {parseFloat(finding.source_value || '68750').toLocaleString('en-IN')}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Exact Source Text:</span>
                  <div
                    style={{
                      background: 'var(--ds-bg)',
                      padding: '8px 12px',
                      borderRadius: 'var(--ds-radius)',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      marginTop: 4,
                      border: '1px solid var(--ds-border-light)',
                    }}
                  >
                    &ldquo;{finding.source_text || 'Total Amount ₹ 68,750.00'}&rdquo;
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Related Comparison:</span>
                  <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginTop: 4 }}>
                    PO-13001.pdf • Expected Amount: <strong>₹ {parseFloat(finding.compared_value || '88500').toLocaleString('en-IN')}</strong>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Engine Reason:</span>
                  <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
                    {finding.reason}
                  </p>
                </div>
              </div>
            </div>

            {/* Suggested Human-in-the-loop Actions (Image 1 bottom right) */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>
                Suggested Review Actions
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => {
                    setReviewDecision('accepted');
                    setShowReviewModal(true);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <CheckCircle size={15} />
                  <span>Mark as Reviewed (Confirm Discrepancy)</span>
                </button>

                <button
                  onClick={() => {
                    setReviewDecision('rejected');
                    setShowReviewModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <XCircle size={15} />
                  <span>Dismiss (Not an Issue)</span>
                </button>

                <button
                  onClick={() => {
                    setReviewDecision('reviewing');
                    setShowReviewModal(true);
                  }}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <HelpCircle size={15} />
                  <span>Request Clarification</span>
                </button>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-info-bg)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  fontSize: '0.75rem',
                  color: 'var(--ds-info)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <Shield size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  DocuSentinel Human Review: Reviewing a finding does not authorize payment. Legal and financial approval must follow external policy.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Details & Review History */}
      {activeTab === 'details' && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 16 }}>
            Review History & Decision Audit
          </h3>

          {finding.is_reviewed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  border: '1px solid var(--ds-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                    Reviewed by {finding.reviewed_by || 'Gurumoorthy S'}
                  </span>
                  <span className="badge badge-success">
                    Decision: {finding.review_decision?.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', margin: '4px 0 0 0' }}>
                  {finding.review_comments || 'No comment recorded.'}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: 8 }}>
                  Timestamp: {finding.reviewed_at ? format(new Date(finding.reviewed_at), 'MMM d, yyyy HH:mm:ss') : 'Recently'}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--ds-text-muted)' }}>
              <p>This finding is currently awaiting human review.</p>
              <button onClick={() => setShowReviewModal(true)} className="btn btn-primary" style={{ marginTop: 8 }}>
                Review Finding Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="card" style={{ maxWidth: 500, width: '92%', padding: 24 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: 8 }}>
              Record Human Review Decision
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: 16 }}>
              {finding.title} ({finding.id})
            </p>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Review Action</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setReviewDecision('accepted')}
                  className={`btn ${reviewDecision === 'accepted' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '8px 6px' }}
                >
                  Confirm Issue
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('rejected')}
                  className={`btn ${reviewDecision === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '8px 6px' }}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('reviewing')}
                  className={`btn ${reviewDecision === 'reviewing' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '8px 6px' }}
                >
                  Investigate
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Review Comments / Notes</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Enter justification or instructions for accounts payable / procurement..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowReviewModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSaveReview}
                className="btn btn-primary"
                disabled={isSavingReview}
              >
                {isSavingReview ? 'Saving...' : 'Save Review Decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function EvidenceViewerPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading evidence...</div>}>
      <EvidenceViewerContent {...props} />
    </Suspense>
  );
}
