'use client';

import { Suspense, useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Document, ExtractedField, LineItem, Finding } from '@/lib/types';
import {
  FileText,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  GitCompareArrows,
  AlertTriangle,
  Download,
  CheckCircle,
  Clock,
  RefreshCw,
  Search,
  ExternalLink,
  Shield,
  FileCheck,
} from 'lucide-react';
import { format } from 'date-fns';

function DocumentDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<Document | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeTab, setActiveTab] = useState<'fields' | 'lineItems' | 'preview' | 'findings'>('fields');
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    const d = DataStore.getDocumentById(resolvedParams.id);
    setDoc(d);
    if (d) {
      setFields(DataStore.getExtractedFields(d.id));
      setLineItems(DataStore.getLineItems(d.id));
      setFindings(DataStore.getFindings().filter((f) => f.source_document_id === d.id || f.compared_document_id === d.id));
    }
  }, [resolvedParams.id]);

  const handleRunExtraction = () => {
    if (!doc) return;
    setIsExtracting(true);

    setTimeout(() => {
      // Add or refresh fields
      if (fields.length === 0) {
        const dummyFields: ExtractedField[] = [
          {
            id: `fld-${Date.now()}-1`,
            document_id: doc.id,
            field_name: 'document_number',
            field_value: `DOC-${Math.floor(Math.random() * 9000) + 1000}`,
            field_type: 'string',
            confidence: 0.98,
            is_missing: false,
            is_ambiguous: false,
            source_text: 'Document Reference No: ' + doc.file_name,
            source_page: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: `fld-${Date.now()}-2`,
            document_id: doc.id,
            field_name: 'total_amount',
            field_value: '75000.00',
            field_type: 'number',
            confidence: 0.96,
            is_missing: false,
            is_ambiguous: false,
            source_text: 'Gross Amount: ₹ 75,000.00',
            source_page: 1,
            created_at: new Date().toISOString(),
          },
          {
            id: `fld-${Date.now()}-3`,
            document_id: doc.id,
            field_name: 'supplier_name',
            field_value: 'Enterprise Logistics & Supplies',
            field_type: 'string',
            confidence: 0.97,
            is_missing: false,
            is_ambiguous: false,
            source_text: 'Vendor Name: Enterprise Logistics & Supplies',
            source_page: 1,
            created_at: new Date().toISOString(),
          },
        ];
        DataStore.addExtractedFields(dummyFields);
        setFields(dummyFields);
      }
      setIsExtracting(false);
    }, 1200);
  };

  if (!doc) {
    return (
      <AppShell>
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <FileText size={48} style={{ color: 'var(--ds-text-muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
            Document Not Found
          </h2>
          <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 20 }}>
            The requested document ID could not be loaded from storage.
          </p>
          <Link href="/documents" className="btn btn-primary">
            Back to Documents
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Top Navigation */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/documents"
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
          <span>Back to Documents</span>
        </Link>
      </div>

      {/* Document Header Card */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'rgba(13, 148, 136, 0.1)',
                color: 'var(--ds-teal-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                  {doc.file_name}
                </h1>
                <span className="badge badge-success">Completed</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.78rem', color: 'var(--ds-text-muted)' }}>
                <span>Category: <strong style={{ color: 'var(--ds-text-secondary)', textTransform: 'capitalize' }}>{doc.category.replace('_', ' ')}</strong></span>
                <span>•</span>
                <span>Size: <strong style={{ color: 'var(--ds-text-secondary)' }}>{(doc.file_size / (1024 * 1024)).toFixed(1)} MB</strong></span>
                <span>•</span>
                <span>Pages: <strong style={{ color: 'var(--ds-text-secondary)' }}>{doc.page_count || 1}</strong></span>
                <span>•</span>
                <span>Uploaded: <strong style={{ color: 'var(--ds-text-secondary)' }}>{format(new Date(doc.created_at), 'MMM d, yyyy HH:mm')}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleRunExtraction}
              className="btn btn-secondary"
              disabled={isExtracting}
            >
              {isExtracting ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} color="var(--ds-teal-500)" />
                  <span>Re-extract with AI</span>
                </>
              )}
            </button>

            <Link href="/reconciliation" className="btn btn-primary">
              <GitCompareArrows size={14} />
              <span>Reconcile</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ds-border)', marginBottom: 20, gap: 24 }}>
        <button
          onClick={() => setActiveTab('fields')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'fields' ? 600 : 500,
            color: activeTab === 'fields' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'fields' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Layers size={16} />
          <span>Extracted Fields</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)', color: 'var(--ds-text-secondary)' }}>
            {fields.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('lineItems')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'lineItems' ? 600 : 500,
            color: activeTab === 'lineItems' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'lineItems' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FileCheck size={16} />
          <span>Line Items</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)', color: 'var(--ds-text-secondary)' }}>
            {lineItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'preview' ? 600 : 500,
            color: activeTab === 'preview' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'preview' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ExternalLink size={16} />
          <span>Document Evidence Preview</span>
        </button>

        <button
          onClick={() => setActiveTab('findings')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'findings' ? 600 : 500,
            color: activeTab === 'findings' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'findings' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={16} />
          <span>Associated Findings</span>
          {findings.length > 0 && (
            <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-error-bg)', color: 'var(--ds-error)' }}>
              {findings.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Extracted Fields Table */}
      {activeTab === 'fields' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Extracted Value</th>
                  <th>Data Type</th>
                  <th>AI Confidence</th>
                  <th>Page</th>
                  <th>Source Evidence Text</th>
                </tr>
              </thead>
              <tbody>
                {fields.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted)' }}>
                      No fields extracted yet. Click &ldquo;Re-extract with AI&rdquo; to analyze this document.
                    </td>
                  </tr>
                ) : (
                  fields.map((f) => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600, color: 'var(--ds-text-primary)', textTransform: 'capitalize' }}>
                        {f.field_name.replace(/_/g, ' ')}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--ds-teal-500)' }}>
                        {f.field_value || <span style={{ color: 'var(--ds-text-muted)' }}>—</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 4, background: 'var(--ds-bg)' }}>
                          {f.field_type}
                        </span>
                      </td>
                      <td>
                        {f.confidence !== null ? (
                          <span
                            className={`badge ${f.confidence > 0.9 ? 'badge-success' : f.confidence > 0.7 ? 'badge-warning' : 'badge-error'}`}
                          >
                            {(f.confidence * 100).toFixed(0)}%
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
                        Page {f.source_page || 1}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', maxWidth: 280 }}>
                        <code style={{ background: 'var(--ds-bg)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem' }}>
                          {f.source_text || 'Exact line match'}
                        </code>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Line Items Table */}
      {activeTab === 'lineItems' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Item #</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                  <th>Unit</th>
                  <th>Page</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted)' }}>
                      No discrete line items detected for this document category.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((li) => (
                    <tr key={li.id}>
                      <td>{li.item_number || 1}</td>
                      <td style={{ fontWeight: 600 }}>{li.description}</td>
                      <td>{li.quantity}</td>
                      <td>₹ {li.unit_price?.toLocaleString('en-IN')}</td>
                      <td style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                        ₹ {li.amount?.toLocaleString('en-IN')}
                      </td>
                      <td>{li.unit || 'unit'}</td>
                      <td>Page {li.source_page || 1}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Document Evidence Preview */}
      {activeTab === 'preview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
          {/* Simulated Document Viewer */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--ds-border-light)', paddingBottom: 12 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {doc.file_name} • Page 2 of {doc.page_count || 2}
              </div>
              <span className="badge badge-info">100% Zoom</span>
            </div>

            <div
              style={{
                background: 'white',
                border: '1px solid var(--ds-border)',
                borderRadius: 'var(--ds-radius)',
                padding: 24,
                boxShadow: 'var(--ds-shadow-sm)',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                lineHeight: 1.8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'sans-serif' }}>METRO SUPPLIES PVT LTD</h3>
                  <div>104 Industrial Estate, Sector 4</div>
                  <div>GSTIN: 27AABCS1429B1Z8</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--ds-teal-500)' }}>TAX INVOICE</div>
                  <div>Invoice No: <strong>INV-5112</strong></div>
                  <div>Date: Apr 18, 2025</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div>Bill To: ABC Tech India Operations</div>
                <div>PO Reference: <strong>PO-13001</strong></div>
                <div>
                  Cost Center:{' '}
                  <span style={{ background: '#fef3c7', padding: '1px 6px', border: '1px dashed #f59e0b', borderRadius: 3 }}>
                    CC-204 (Mismatch vs PO: CC-203)
                  </span>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc' }}>
                    <th style={{ textAlign: 'left', padding: 6 }}>Description</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Rate</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: 6 }}>Executive High-Back Chairs</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>10</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>6,500.00</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>65,000.00</td>
                  </tr>
                  <tr>
                    <td style={{ padding: 6 }}>Freight & GST Surcharge</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>1</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>3,750.00</td>
                    <td style={{ textAlign: 'right', padding: 6 }}>3,750.00</td>
                  </tr>
                </tbody>
              </table>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  borderTop: '2px solid #000',
                  paddingTop: 8,
                }}
              >
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, background: '#fee2e2', padding: '4px 10px', borderRadius: 4, border: '1px solid #ef4444' }}>
                    Total Amount: ₹ 68,750.00
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Information Box */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>
              Extraction Metadata
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>MIME Type:</span>{' '}
                <strong>{doc.mime_type}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>SHA-256 Hash:</span>{' '}
                <code style={{ fontSize: '0.75rem' }}>{doc.file_hash || 'verified-integrity'}</code>
              </div>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>OCR Engine:</span>{' '}
                <strong>Gemini Vision Multimodal</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>Source Grounding:</span>{' '}
                <span className="badge badge-success">Direct Document Evidence</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Associated Findings */}
      {activeTab === 'findings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {findings.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--ds-text-muted)' }}>
              <CheckCircle size={36} color="var(--ds-success)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>No Discrepancies Found</div>
              <p style={{ fontSize: '0.8rem' }}>This document has passed reconciliation verification with zero flagged anomalies.</p>
            </div>
          ) : (
            findings.map((f) => (
              <div
                key={f.id}
                className="card"
                style={{
                  padding: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderLeft: `4px solid ${f.severity === 'high' ? 'var(--ds-error)' : 'var(--ds-warning)'}`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--ds-text-primary)' }}>{f.title}</span>
                    <span className={`badge ${f.severity === 'high' ? 'badge-error' : 'badge-warning'}`}>
                      {f.severity.toUpperCase()}
                    </span>
                    <span className="badge">{f.id}</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', margin: 0 }}>
                    {f.description}
                  </p>
                </div>

                <Link href={`/findings/${f.id}`} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
                  View Evidence
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function DocumentDetailsPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading document...</div>}>
      <DocumentDetailsContent {...props} />
    </Suspense>
  );
}
