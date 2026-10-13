'use client';

import { Suspense, useState, useEffect, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Finding, Document, ExtractedField } from '@/lib/types';
import {
  ArrowLeft,
  AlertTriangle,
  GitCompareArrows,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  ZoomIn,
  ZoomOut,
  Download,
  Shield,
  Layers,
  FileSearch,
} from 'lucide-react';
import { format } from 'date-fns';

function EvidenceViewerContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);

  const [finding, setFinding] = useState<Finding | null>(null);
  const [sourceDoc, setSourceDoc] = useState<Document | null>(null);
  const [comparedDoc, setComparedDoc] = useState<Document | null>(null);
  const [sourceFields, setSourceFields] = useState<ExtractedField[]>([]);
  const [docText, setDocText] = useState<string>('');
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<'evidence' | 'details'>('evidence');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'accepted' | 'rejected' | 'reviewing'>('accepted');
  const [reviewComment, setReviewComment] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingEvidence(true);

    DataStore.getFindingEvidence(resolvedParams.id)
      .then((data: any) => {
        if (!isMounted) return;
        if (data.finding) {
          setFinding(data.finding);
          setSourceDoc(data.sourceDocument);
          setComparedDoc(data.comparedDocument);
          setSourceFields(data.sourceFields);
          if (data.finding.source_page) {
            setCurrentPage(data.finding.source_page);
          }
          if (data.sourceDocument?.page_count) {
            setTotalPages(data.sourceDocument.page_count);
          }

          // Fetch real document text for evidence highlighting
          if (data.sourceDocument?.id) {
            setIsLoadingText(true);
            fetch(`/api/documents/${data.sourceDocument.id}/file?text=true`)
              .then((res) => (res.ok ? res.json() : null))
              .then((textData) => {
                if (!isMounted) return;
                if (textData?.data?.text) {
                  setDocText(textData.data.text);
                  if (textData.data.pageCount) {
                    setTotalPages(textData.data.pageCount);
                  }
                }
              })
              .catch(() => {})
              .finally(() => {
                if (isMounted) setIsLoadingText(false);
              });
          }
        }
      })
      .catch((err: any) => {
        console.error('Failed to load finding evidence:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingEvidence(false);
      });

    return () => {
      isMounted = false;
    };
  }, [resolvedParams.id]);

  const handleSaveReview = async () => {
    if (!finding) return;
    setIsSavingReview(true);

    try {
      const updated = await DataStore.saveFindingReviewApi(
        finding.id,
        reviewDecision,
        reviewComment,
        'Gurumoorthy S'
      );
      if (updated) {
        setFinding(updated);
      }
      setShowReviewModal(false);
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setIsSavingReview(false);
    }
  };

  // Helper to highlight exact source passage in real document text
  const renderHighlightedDocumentText = () => {
    if (isLoadingText) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ds-text-secondary)' }}>
          <FileSearch size={24} style={{ margin: '0 auto 8px', animation: 'spin 2s linear infinite' }} />
          <div>Retrieving stored document plain text stream...</div>
        </div>
      );
    }

    if (!docText) {
      return (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--ds-text-secondary)' }}>
          <AlertTriangle size={24} style={{ margin: '0 auto 8px', color: 'var(--ds-warning)' }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Extracted Plain Text Not Available</div>
          <p style={{ fontSize: '0.82rem', maxWidth: 460, margin: '0 auto' }}>
            {sourceDoc
              ? `Document ${sourceDoc.file_name} does not have cached plain-text extracted or is a binary format. You can download and inspect the original file directly.`
              : 'The source document for this finding is unlinked or was generated in an earlier session.'}
          </p>
          {sourceDoc && (
            <a
              href={`/api/documents/${sourceDoc.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ marginTop: 14 }}
            >
              <Download size={14} />
              <span>Download Original {sourceDoc.file_name}</span>
            </a>
          )}
        </div>
      );
    }

    const passage = finding?.source_text?.trim();

    if (!passage) {
      return (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            lineHeight: 1.6,
            margin: 0,
            color: 'var(--ds-text-primary)',
          }}
        >
          {docText}
        </pre>
      );
    }

    // Try finding exact or normalized match
    const lowerText = docText.toLowerCase();
    const lowerPassage = passage.toLowerCase();
    const matchIndex = lowerText.indexOf(lowerPassage);

    if (matchIndex === -1) {
      return (
        <div>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--ds-radius)',
              background: 'var(--ds-warning-bg)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              marginBottom: 16,
              fontSize: '0.8rem',
              color: 'var(--ds-warning)',
            }}
          >
            <strong>Note:</strong> Exact passage &ldquo;{passage}&rdquo; was extracted by the parser but could not be strictly aligned character-for-character in the raw text stream. Raw document content shown below.
          </div>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              lineHeight: 1.6,
              margin: 0,
              color: 'var(--ds-text-primary)',
            }}
          >
            {docText}
          </pre>
        </div>
      );
    }

    const before = docText.slice(0, matchIndex);
    const matched = docText.slice(matchIndex, matchIndex + passage.length);
    const after = docText.slice(matchIndex + passage.length);

    return (
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'monospace',
          fontSize: '0.82rem',
          lineHeight: 1.6,
          margin: 0,
          color: 'var(--ds-text-primary)',
        }}
      >
        {before}
        <mark
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            border: '2px solid #ef4444',
            borderRadius: 4,
            padding: '2px 6px',
            fontWeight: 700,
            boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
            display: 'inline-block',
          }}
          title={`Flagged Field: ${finding?.source_field || 'Value'}`}
        >
          {matched}
        </mark>
        {after}
      </pre>
    );
  };

  if (isLoadingEvidence) {
    return (
      <AppShell>
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--ds-text-secondary)' }}>
          <FileSearch size={36} style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Loading Finding & Evidence...</h2>
        </div>
      </AppShell>
    );
  }

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

      {/* Main Finding Banner */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: finding.severity === 'high' || finding.severity === 'critical' ? 'var(--ds-error-bg)' : 'var(--ds-warning-bg)',
                  color: finding.severity === 'high' || finding.severity === 'critical' ? 'var(--ds-error)' : 'var(--ds-warning)',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {finding.severity.toUpperCase()} SEVERITY
              </span>
              <span className="badge">Finding ID: {finding.id}</span>
              <span className="badge">Rule: {finding.rule_id}</span>
              <span className="badge badge-info">Status: {finding.status.toUpperCase()}</span>
              {finding.is_reviewed && (
                <span className="badge badge-success">Decision: {finding.review_decision?.toUpperCase()}</span>
              )}
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              marginTop: 20,
              paddingTop: 20,
              borderTop: '1px solid var(--ds-border-light)',
            }}
          >
            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Financial Impact / Variance</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-error)' }}>
                ₹ {finding.financial_impact?.toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                Observed ({sourceDoc?.category?.replace('_', ' ').toUpperCase() || 'Source Document'})
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
                {finding.source_value ? `₹ ${parseFloat(finding.source_value).toLocaleString('en-IN')}` : 'N/A'}
              </div>
            </div>

            <div style={{ background: 'var(--ds-bg)', padding: '12px 16px', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                Expected ({comparedDoc?.category?.replace('_', ' ').toUpperCase() || 'Comparison Baseline'})
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
                {finding.compared_value ? `₹ ${parseFloat(finding.compared_value).toLocaleString('en-IN')}` : 'N/A'}
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

      {/* Tab 1: Evidence Split View */}
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
                  {sourceDoc?.file_name || (finding.source_document_id ? `${finding.source_document_id}.pdf` : 'Source Document')}
                </span>
                <span className="badge badge-info">Page {currentPage} of {totalPages}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {sourceDoc && (
                  <a
                    href={`/api/documents/${sourceDoc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-btn"
                    title="Download/Open Raw File"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Download size={16} />
                  </a>
                )}
                <button
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="icon-btn"
                  title="Zoom Out"
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', minWidth: 42, textAlign: 'center' }}>
                  {zoomLevel}%
                </span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
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
                padding: '24px 28px',
                minHeight: 460,
                maxHeight: 640,
                overflowY: 'auto',
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s ease',
              }}
            >
              {renderHighlightedDocumentText()}
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Flagged Field:</span>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text-primary)' }}>
                    {finding.source_field || 'Value / Obligation'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Observed Value:</span>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ds-error)' }}>
                    {finding.source_value ? `₹ ${parseFloat(finding.source_value).toLocaleString('en-IN')}` : 'N/A'}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Exact Source Passage:</span>
                  <div
                    style={{
                      background: 'var(--ds-bg)',
                      padding: '8px 12px',
                      borderRadius: 'var(--ds-radius)',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      marginTop: 4,
                      border: '1px solid var(--ds-border-light)',
                      wordBreak: 'break-word',
                    }}
                  >
                    &ldquo;{finding.source_text || finding.source_value || 'Direct parsed calculation'}&rdquo;
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Related Comparison:</span>
                  <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginTop: 4 }}>
                    {comparedDoc?.file_name || 'Comparison Document'} • Expected: <strong>
                      {finding.compared_value ? `₹ ${parseFloat(finding.compared_value).toLocaleString('en-IN')}` : 'N/A'}
                    </strong>
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

            {/* Suggested Human-in-the-loop Actions */}
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
                  DocuSentinel Human Review: Reviewing a finding documents human authorization for audit traceability.
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 14, background: 'var(--ds-bg)', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Source Document</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{sourceDoc?.file_name || finding.source_document_id || 'N/A'}</div>
            </div>

            <div style={{ padding: 14, background: 'var(--ds-bg)', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Comparison Document</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{comparedDoc?.file_name || finding.compared_document_id || 'N/A'}</div>
            </div>

            <div style={{ padding: 14, background: 'var(--ds-bg)', borderRadius: 'var(--ds-radius)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Detected On</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {finding.created_at ? format(new Date(finding.created_at), 'MMM d, yyyy HH:mm:ss') : 'N/A'}
              </div>
            </div>
          </div>

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
