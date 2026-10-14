'use client';

import { Suspense, useState, useEffect, use } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import { useAuth } from '@/lib/auth/AuthContext';
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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Quote,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

interface AiExplanationData {
  findingId: string;
  title: string;
  explanation: string;
  rootCause: string;
  recommendedAction: string;
  confidence: number;
  isAiGenerated: boolean;
  modelUsed: string;
}

function EvidenceViewerContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { profile } = useAuth();

  const [finding, setFinding] = useState<Finding | null>(null);
  const [sourceDoc, setSourceDoc] = useState<Document | null>(null);
  const [comparedDoc, setComparedDoc] = useState<Document | null>(null);
  const [sourceFields, setSourceFields] = useState<ExtractedField[]>([]);
  const [comparedFields, setComparedFields] = useState<ExtractedField[]>([]);
  const [docText, setDocText] = useState<string>('');
  const [comparedDocText, setComparedDocText] = useState<string>('');
  const [isLoadingText, setIsLoadingText] = useState<boolean>(false);
  const [isLoadingComparedText, setIsLoadingComparedText] = useState<boolean>(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<'evidence' | 'details'>('evidence');
  const [viewMode, setViewMode] = useState<'dual' | 'source' | 'compared'>('dual');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [comparedZoomLevel, setComparedZoomLevel] = useState(100);
  const [comparedCurrentPage, setComparedCurrentPage] = useState(1);
  const [comparedTotalPages, setComparedTotalPages] = useState(1);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'accepted' | 'rejected' | 'reviewing'>('accepted');
  const [reviewComment, setReviewComment] = useState('');
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // AI Explanation State
  const [aiExplanation, setAiExplanation] = useState<AiExplanationData | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
          setSourceFields(data.sourceFields || []);
          setComparedFields(data.comparedFields || []);
          if (data.finding.source_page) {
            setCurrentPage(data.finding.source_page);
          }
          if (data.sourceDocument?.page_count) {
            setTotalPages(Math.max(1, data.sourceDocument.page_count));
          }
          if (data.finding.compared_page) {
            setComparedCurrentPage(data.finding.compared_page);
          }
          if (data.comparedDocument?.page_count) {
            setComparedTotalPages(Math.max(1, data.comparedDocument.page_count));
          }
          if (data.finding.review_decision) {
            setReviewDecision(data.finding.review_decision);
          }
          if (data.finding.review_comments) {
            setReviewComment(data.finding.review_comments);
          }

          // Fetch source document text for evidence highlighting
          if (data.sourceDocument?.id) {
            setIsLoadingText(true);
            fetch(`/api/documents/${data.sourceDocument.id}/file?text=true`)
              .then((res) => (res.ok ? res.json() : null))
              .then((textData) => {
                if (!isMounted) return;
                if (textData?.data?.text) {
                  setDocText(textData.data.text);
                  if (textData.data.pageCount) {
                    setTotalPages(Math.max(1, textData.data.pageCount));
                  }
                }
              })
              .catch(() => {})
              .finally(() => {
                if (isMounted) setIsLoadingText(false);
              });
          }

          // Fetch compared document text for dual-sided evidence highlighting
          if (data.comparedDocument?.id) {
            setIsLoadingComparedText(true);
            fetch(`/api/documents/${data.comparedDocument.id}/file?text=true`)
              .then((res) => (res.ok ? res.json() : null))
              .then((textData) => {
                if (!isMounted) return;
                if (textData?.data?.text) {
                  setComparedDocText(textData.data.text);
                  if (textData.data.pageCount) {
                    setComparedTotalPages(Math.max(1, textData.data.pageCount));
                  }
                }
              })
              .catch(() => {})
              .finally(() => {
                if (isMounted) setIsLoadingComparedText(false);
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

  const handleFetchAiExplanation = async () => {
    if (!finding) return;
    setIsLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/findings/${finding.id}/explain`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setAiExplanation(data.data);
      } else {
        setAiError(data.error || 'Failed to generate AI explanation');
      }
    } catch (err: any) {
      setAiError(err.message || 'Network error fetching AI explanation');
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleSaveReview = async () => {
    if (!finding) return;
    setIsSavingReview(true);

    try {
      const updated = await DataStore.saveFindingReviewApi(
        finding.id,
        reviewDecision,
        reviewComment,
        profile?.full_name || 'Reviewer'
      );
      if (updated) {
        setFinding(updated);
        setSaveSuccessMsg('Review decision recorded to audit log.');
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      }
      setShowReviewModal(false);
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setIsSavingReview(false);
    }
  };

  // Modular Document Evidence Canvas with text highlighting & 2D bounding box overlay
  const renderDocumentEvidenceCanvas = ({
    side,
    doc,
    text,
    isLoading,
    page,
    totalPages: docTotalPages,
    setPage,
    zoom,
    setZoom,
    fieldName,
    value,
    passage,
    verified,
    boundingBox,
  }: {
    side: 'source' | 'compared';
    doc: Document | null;
    text: string;
    isLoading: boolean;
    page: number;
    totalPages: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    zoom: number;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    fieldName?: string | null;
    value?: string | null;
    passage?: string | null;
    verified?: boolean;
    boundingBox?: import('@/lib/types').BoundingBox | null;
  }) => {
    const isSource = side === 'source';
    const accentColor = isSource ? 'var(--ds-error)' : 'var(--ds-teal-500)';
    const accentBg = isSource ? '#fee2e2' : '#ccfbf1';
    const accentBorder = isSource ? '#ef4444' : '#0d9488';

    return (
      <div className="card" style={{ padding: 20 }}>
        {/* Document Header Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottom: '1px solid var(--ds-border-light)',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <FileText size={18} color={accentColor} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {doc?.file_name || (isSource ? 'Source Document' : 'Comparison Document')}
            </span>
            <span className={`badge ${isSource ? 'badge-error' : 'badge-teal'}`}>
              {doc?.category?.replace(/_/g, ' ').toUpperCase() || (isSource ? 'SOURCE' : 'BASELINE')}
            </span>

            {/* Interactive Page Navigation Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="icon-btn"
                title="Previous Page"
                style={{ padding: '3px 6px', height: 28, opacity: page <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={15} />
              </button>
              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                Page {page} of {docTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(docTotalPages, p + 1))}
                disabled={page >= docTotalPages}
                className="icon-btn"
                title="Next Page"
                style={{ padding: '3px 6px', height: 28, opacity: page >= docTotalPages ? 0.4 : 1 }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {doc && (
              <a
                href={`/api/documents/${doc.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="icon-btn"
                title={`Download/Open Raw ${doc.file_name}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Download size={16} />
              </a>
            )}
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(70, z - 10))}
              className="icon-btn"
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', minWidth: 42, textAlign: 'center' }}>
              {zoom}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(140, z + 10))}
              className="icon-btn"
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>

        {/* Evidence Grounding & Verification Metadata Box */}
        <div
          style={{
            background: 'var(--ds-bg)',
            border: '1px solid var(--ds-border)',
            borderRadius: 'var(--ds-radius)',
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Quote size={15} color={accentColor} />
              <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--ds-text-primary)' }}>
                {isSource ? 'Flagged Source Passage' : 'Baseline Reference Passage'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="badge">Field: {fieldName || 'Value'}</span>
              {value && <span className="badge badge-info">Value: {value}</span>}
              {verified === false ? (
                <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} />
                  <span>Unverified Grounding</span>
                </span>
              ) : (
                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={11} />
                  <span>Verified Grounded</span>
                </span>
              )}
              {boundingBox && (
                <span
                  className="badge"
                  title={`Bounding box on page ${boundingBox.page}: x=${Math.round(boundingBox.x * 100)}%, y=${Math.round(boundingBox.y * 100)}%, w=${Math.round(boundingBox.width * 100)}%, h=${Math.round(boundingBox.height * 100)}%`}
                  style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                >
                  Box: P{boundingBox.page} [{Math.round(boundingBox.x * 100)}%, {Math.round(boundingBox.y * 100)}%]
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              background: 'white',
              padding: '10px 14px',
              borderRadius: 'var(--ds-radius-sm)',
              borderLeft: `3px solid ${accentBorder}`,
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              color: 'var(--ds-text-primary)',
              wordBreak: 'break-word',
              boxShadow: 'var(--ds-shadow-sm)',
            }}
          >
            &ldquo;{passage || value || 'Direct computation / tabular extraction'}&rdquo;
          </div>
        </div>

        {/* Document Canvas with Text Highlighting and 2D Bounding Box Overlay */}
        <div
          style={{
            position: 'relative',
            background: '#fafafa',
            border: '1px solid var(--ds-border)',
            borderRadius: 'var(--ds-radius)',
            padding: '24px 28px',
            minHeight: 460,
            maxHeight: 640,
            overflowY: 'auto',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease',
          }}
        >
          {/* Visual 2D Bounding Box Highlight Overlay */}
          {boundingBox && (boundingBox.page === page || boundingBox.page === 1) && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.max(2, Math.min(90, boundingBox.x * 100))}%`,
                top: `${Math.max(2, Math.min(85, boundingBox.y * 100))}%`,
                width: `${Math.max(8, Math.min(95, boundingBox.width * 100))}%`,
                height: `${Math.max(3, Math.min(30, boundingBox.height * 100))}%`,
                border: `2px solid ${accentBorder}`,
                backgroundColor: isSource ? 'rgba(239, 68, 68, 0.12)' : 'rgba(13, 148, 136, 0.12)',
                boxShadow: isSource ? '0 0 10px rgba(239, 68, 68, 0.35)' : '0 0 10px rgba(13, 148, 136, 0.35)',
                borderRadius: 4,
                pointerEvents: 'none',
                zIndex: 10,
                transition: 'all 0.3s ease',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -18,
                  left: 0,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: isSource ? '#ef4444' : '#0d9488',
                  background: accentBg,
                  border: `1px solid ${accentBorder}`,
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {isSource ? 'FLAGGED REGION' : 'BASELINE REGION'}: {fieldName || 'FIELD'}
              </span>
            </div>
          )}

          {/* Render Text Stream */}
          {isLoading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ds-text-secondary)' }}>
              <FileSearch size={24} style={{ margin: '0 auto 8px', animation: 'spin 2s linear infinite' }} />
              <div>Retrieving stored document plain text stream...</div>
            </div>
          ) : !text ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--ds-text-secondary)' }}>
              <AlertTriangle size={24} style={{ margin: '0 auto 8px', color: 'var(--ds-warning)' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Extracted Plain Text Not Available</div>
              <p style={{ fontSize: '0.82rem', maxWidth: 460, margin: '0 auto' }}>
                {doc
                  ? `Document ${doc.file_name} does not have cached plain-text extracted or is a binary format. You can download and inspect the original file directly.`
                  : 'Document text stream is unavailable.'}
              </p>
              {doc && (
                <a
                  href={`/api/documents/${doc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ marginTop: 14 }}
                >
                  <Download size={14} />
                  <span>Download Original {doc.file_name}</span>
                </a>
              )}
            </div>
          ) : (() => {
            const trimmedPassage = passage?.trim();
            if (!trimmedPassage) {
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
                  {text}
                </pre>
              );
            }

            const lowerText = text.toLowerCase();
            const lowerPassage = trimmedPassage.toLowerCase();
            const matchIndex = lowerText.indexOf(lowerPassage);

            if (matchIndex === -1) {
              return (
                <div>
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--ds-radius)',
                      background: 'var(--ds-warning-bg)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      marginBottom: 16,
                      fontSize: '0.8rem',
                      color: 'var(--ds-warning)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <strong>Passage Alignment Note:</strong> The exact passage &ldquo;{trimmedPassage}&rdquo; was parsed by the document intelligence engine from Page {page || 1}, but could not be strictly aligned character-for-character in the raw text stream. Raw document content shown below.
                    </div>
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
                    {text}
                  </pre>
                </div>
              );
            }

            const before = text.slice(0, matchIndex);
            const matched = text.slice(matchIndex, matchIndex + trimmedPassage.length);
            const after = text.slice(matchIndex + trimmedPassage.length);

            return (
              <div>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--ds-radius)',
                    background: 'var(--ds-success-bg)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: 14,
                    fontSize: '0.78rem',
                    color: 'var(--ds-success)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <CheckCircle size={14} />
                  <span>Verified passage located and highlighted at exact text coordinate below.</span>
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
                  {before}
                  <mark
                    style={{
                      background: accentBg,
                      color: isSource ? '#991b1b' : '#115e59',
                      border: `2px solid ${accentBorder}`,
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontWeight: 700,
                      boxShadow: isSource ? '0 0 8px rgba(239, 68, 68, 0.4)' : '0 0 8px rgba(13, 148, 136, 0.4)',
                      display: 'inline-block',
                    }}
                    title={`${isSource ? 'Flagged' : 'Baseline'} Field: ${fieldName || 'Value'}`}
                  >
                    {matched}
                  </mark>
                  {after}
                </pre>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // Reusable Evidence Cross-Reference Card
  const renderEvidenceCrossReferenceCard = () => (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>
        Evidence Grounding
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Flagged Field:</span>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ds-text-primary)' }}>
            {finding?.source_field || 'Value / Obligation'}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Observed Value:</span>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ds-error)' }}>
            {finding?.source_value ? `₹ ${parseFloat(finding.source_value).toLocaleString('en-IN')}` : 'N/A'}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Related Comparison:</span>
          <div style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginTop: 4 }}>
            {comparedDoc?.file_name || 'Comparison Document'} • Expected: <strong>
              {finding?.compared_value ? `₹ ${parseFloat(finding.compared_value).toLocaleString('en-IN')}` : 'N/A'}
            </strong>
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Engine Reason:</span>
          <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', margin: '4px 0 0 0', lineHeight: 1.5 }}>
            {finding?.reason}
          </p>
        </div>
      </div>
    </div>
  );

  // Reusable AI Explanation Card
  const renderAiExplanationCard = () => (
    <div className="card" style={{ padding: 20, border: '1px solid rgba(13, 148, 136, 0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="var(--ds-teal-500)" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>
            AI Root Cause Analysis
          </h3>
        </div>
        <button
          type="button"
          onClick={handleFetchAiExplanation}
          disabled={isLoadingAi}
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: '0.72rem' }}
          title="Generate or Refresh AI Explanation"
        >
          {isLoadingAi ? (
            <RefreshCw size={12} className="spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          <span>{aiExplanation ? 'Refresh' : 'Analyze'}</span>
        </button>
      </div>

      {aiExplanation ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.82rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Root Cause:</span>
            <p style={{ margin: '2px 0 0 0', color: 'var(--ds-text-primary)', lineHeight: 1.4 }}>
              {aiExplanation.rootCause}
            </p>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>Recommended Action:</span>
            <p style={{ margin: '2px 0 0 0', color: 'var(--ds-text-secondary)', lineHeight: 1.4 }}>
              {aiExplanation.recommendedAction}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--ds-border-light)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
              Confidence: {(aiExplanation.confidence * 100).toFixed(0)}% • {aiExplanation.modelUsed}
            </span>
            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
              AI Generated
            </span>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--ds-text-muted)', fontSize: '0.82rem' }}>
          <p style={{ margin: '0 0 10px 0' }}>
            Generate an AI root cause diagnosis and recommended auditor action based on cross-document evidence.
          </p>
          <button
            type="button"
            onClick={handleFetchAiExplanation}
            disabled={isLoadingAi}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', margin: '0 auto' }}
          >
            <Sparkles size={14} color="var(--ds-teal-500)" />
            <span>{isLoadingAi ? 'Analyzing Evidence...' : 'Generate AI Diagnosis'}</span>
          </button>
        </div>
      )}

      {aiError && (
        <div style={{ fontSize: '0.75rem', color: 'var(--ds-error)', marginTop: 8 }}>
          {aiError}
        </div>
      )}
    </div>
  );

  // Reusable Human Review Decision Card
  const renderReviewDecisionCard = () => (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 14 }}>
        Review Decision Actions
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <button
            type="button"
            onClick={() => setReviewDecision('accepted')}
            className={`btn ${reviewDecision === 'accepted' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '8px 4px', justifyContent: 'center' }}
          >
            <CheckCircle size={13} />
            <span>Confirm</span>
          </button>
          <button
            type="button"
            onClick={() => setReviewDecision('rejected')}
            className={`btn ${reviewDecision === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '8px 4px', justifyContent: 'center' }}
          >
            <XCircle size={13} />
            <span>Dismiss</span>
          </button>
          <button
            type="button"
            onClick={() => setReviewDecision('reviewing')}
            className={`btn ${reviewDecision === 'reviewing' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '8px 4px', justifyContent: 'center' }}
          >
            <HelpCircle size={13} />
            <span>Investigate</span>
          </button>
        </div>

        <textarea
          className="form-input"
          rows={2}
          placeholder="Reviewer justification or notes..."
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
          style={{ fontSize: '0.8rem', resize: 'vertical' }}
        />

        <button
          type="button"
          onClick={handleSaveReview}
          disabled={isSavingReview}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isSavingReview ? (
            <>
              <RefreshCw size={14} className="spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check size={14} />
              <span>Save Decision</span>
            </>
          )}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '8px 10px',
          borderRadius: 'var(--ds-radius)',
          background: 'var(--ds-info-bg)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: '0.74rem',
          color: 'var(--ds-info)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <Shield size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          All human decisions are permanently recorded in the immutable audit log.
        </span>
      </div>
    </div>
  );

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
          <span>Back to Findings Matrix</span>
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
              <span>Record Review Decision</span>
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

      {saveSuccessMsg && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: 16,
            borderRadius: 'var(--ds-radius)',
            background: 'var(--ds-success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--ds-success)',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CheckCircle size={16} />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

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

      {/* Tab 1: Evidence Split / Dual Comparison View */}
      {activeTab === 'evidence' && (
        <div>
          {comparedDoc && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
                padding: '12px 18px',
                background: 'var(--ds-surface)',
                border: '1px solid var(--ds-border)',
                borderRadius: 'var(--ds-radius)',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GitCompareArrows size={18} color="var(--ds-teal-500)" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Dual-Sided Grounded Evidence Comparison
                </span>
                <span className="badge badge-info">
                  {sourceDoc?.category?.replace(/_/g, ' ').toUpperCase() || 'SOURCE'} vs {comparedDoc.category?.replace(/_/g, ' ').toUpperCase() || 'BASELINE'}
                </span>
              </div>

              {/* View Mode Segmented Control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--ds-bg)', padding: 3, borderRadius: 'var(--ds-radius)' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('dual')}
                  className={`btn ${viewMode === 'dual' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                >
                  Side-by-Side (1:1)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('source')}
                  className={`btn ${viewMode === 'source' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                >
                  Source Only
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compared')}
                  className={`btn ${viewMode === 'compared' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                >
                  Baseline Only
                </button>
              </div>
            </div>
          )}

          {/* Dual Side-by-Side Comparison Layout */}
          {comparedDoc && viewMode === 'dual' ? (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                {/* Left: Source Document Evidence */}
                {renderDocumentEvidenceCanvas({
                  side: 'source',
                  doc: sourceDoc,
                  text: docText,
                  isLoading: isLoadingText,
                  page: currentPage,
                  totalPages,
                  setPage: setCurrentPage,
                  zoom: zoomLevel,
                  setZoom: setZoomLevel,
                  fieldName: finding.source_field,
                  value: finding.source_value,
                  passage: finding.source_text,
                  verified: finding.source_verified,
                  boundingBox: finding.source_bounding_box,
                })}

                {/* Right: Compared Document Evidence */}
                {renderDocumentEvidenceCanvas({
                  side: 'compared',
                  doc: comparedDoc,
                  text: comparedDocText,
                  isLoading: isLoadingComparedText,
                  page: comparedCurrentPage,
                  totalPages: comparedTotalPages,
                  setPage: setComparedCurrentPage,
                  zoom: comparedZoomLevel,
                  setZoom: setComparedZoomLevel,
                  fieldName: finding.compared_field,
                  value: finding.compared_value,
                  passage: finding.compared_text,
                  verified: finding.compared_verified,
                  boundingBox: finding.compared_bounding_box,
                })}
              </div>

              {/* Bottom Row: AI Analysis & Review Decision */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                  gap: 20,
                }}
              >
                {renderAiExplanationCard()}
                {renderReviewDecisionCard()}
              </div>
            </div>
          ) : (
            /* Single Focus View (Source or Compared, or when no comparison doc exists) */
            <div className="evidence-split-layout">
              <div>
                {viewMode === 'compared' && comparedDoc ? (
                  renderDocumentEvidenceCanvas({
                    side: 'compared',
                    doc: comparedDoc,
                    text: comparedDocText,
                    isLoading: isLoadingComparedText,
                    page: comparedCurrentPage,
                    totalPages: comparedTotalPages,
                    setPage: setComparedCurrentPage,
                    zoom: comparedZoomLevel,
                    setZoom: setComparedZoomLevel,
                    fieldName: finding.compared_field,
                    value: finding.compared_value,
                    passage: finding.compared_text,
                    verified: finding.compared_verified,
                    boundingBox: finding.compared_bounding_box,
                  })
                ) : (
                  renderDocumentEvidenceCanvas({
                    side: 'source',
                    doc: sourceDoc,
                    text: docText,
                    isLoading: isLoadingText,
                    page: currentPage,
                    totalPages,
                    setPage: setCurrentPage,
                    zoom: zoomLevel,
                    setZoom: setZoomLevel,
                    fieldName: finding.source_field,
                    value: finding.source_value,
                    passage: finding.source_text,
                    verified: finding.source_verified,
                    boundingBox: finding.source_bounding_box,
                  })
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {renderEvidenceCrossReferenceCard()}
                {renderAiExplanationCard()}
                {renderReviewDecisionCard()}
              </div>
            </div>
          )}
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
                    Reviewed by {finding.reviewed_by || 'Reviewer'}
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
          role="dialog"
          aria-modal="true"
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
