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
  BookOpen,
  X,
  Edit3,
  Save,
  Plus,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

interface AiSummaryData {
  summary: string;
  keyPoints: string[];
  riskLevel: 'low' | 'medium' | 'high';
  obligations: string[];
  missingInformation: string[];
  isAiGenerated: boolean;
  modelUsed: string;
}

function DocumentDetailsContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<Document | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeTab, setActiveTab] = useState<'fields' | 'lineItems' | 'preview' | 'findings'>('fields');
  const [isExtracting, setIsExtracting] = useState(false);
  const [docText, setDocText] = useState<string>('');

  // AI Summary State
  const [aiSummary, setAiSummary] = useState<AiSummaryData | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Table Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState<ExtractedField[]>([]);
  const [editLineItems, setEditLineItems] = useState<LineItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      const details = await DataStore.fetchDocumentDetails(resolvedParams.id);
      if (!isMounted) return;
      setDoc(details.document);
      setFields(details.fields);
      setLineItems(details.lineItems);
      setFindings(details.findings);

      // Fetch actual document text for preview
      try {
        const textRes = await fetch(`/api/documents/${resolvedParams.id}/file?text=true`);
        if (textRes.ok) {
          const json = await textRes.json();
          if (json.success && json.data?.text && isMounted) {
            setDocText(json.data.text);
          }
        }
      } catch {
        // ignore
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, [resolvedParams.id]);

  const handleRunExtraction = async () => {
    if (!doc) return;
    setIsExtracting(true);
    try {
      const updated = await DataStore.reprocessDocumentApi(doc.id);
      if (updated) {
        setDoc(updated);
        const details = await DataStore.fetchDocumentDetails(doc.id);
        setFields(details.fields);
        setLineItems(details.lineItems);
        setFindings(details.findings);
      }
    } catch (err) {
      console.error('Extraction error:', err);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!doc) return;
    setIsLoadingSummary(true);
    setSummaryError(null);
    setShowSummaryModal(true);

    try {
      const res = await fetch(`/api/documents/${doc.id}/summarize`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success && data.data) {
        setAiSummary(data.data);
      } else {
        setSummaryError(data.error || 'Failed to generate summary');
      }
    } catch (err: any) {
      setSummaryError(err.message || 'Network error generating summary');
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // Table Editing Handlers
  const handleStartEditing = () => {
    setEditFields(fields.map((f) => ({ ...f })));
    setEditLineItems(lineItems.map((li) => ({ ...li })));
    setIsEditing(true);
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setEditFields([]);
    setEditLineItems([]);
    setSaveError(null);
  };

  const handleSaveChanges = async () => {
    if (!doc) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await DataStore.updateDocumentFieldsApi(doc.id, editFields, editLineItems);
      if (res.success) {
        setFields(res.fields);
        setLineItems(res.lineItems);
        setIsEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 5000);
      }
    } catch (err: unknown) {
      setSaveError((err as Error).message || 'Failed to save changes to document');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateField = (index: number, key: keyof ExtractedField, value: any) => {
    setEditFields((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  };

  const handleAddField = () => {
    if (!doc) return;
    const newField: ExtractedField = {
      id: `field-${doc.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      document_id: doc.id,
      field_name: 'new_field',
      field_value: '',
      field_type: 'string',
      confidence: 1.0,
      is_missing: false,
      is_ambiguous: false,
      source_text: 'Manual table entry',
      source_page: 1,
      created_at: new Date().toISOString(),
    };
    setEditFields((prev) => [...prev, newField]);
  };

  const handleRemoveField = (index: number) => {
    setEditFields((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateLineItem = (index: number, key: keyof LineItem, value: any) => {
    setEditLineItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [key]: value };

      if (key === 'quantity' || key === 'unit_price') {
        const qty = key === 'quantity' ? (parseFloat(value) || 0) : (item.quantity || 0);
        const price = key === 'unit_price' ? (parseFloat(value) || 0) : (item.unit_price || 0);
        item.amount = Math.round(qty * price * 100) / 100;
      }

      updated[index] = item;
      return updated;
    });
  };

  const handleAddLineItem = () => {
    if (!doc) return;
    const nextNumber = editLineItems.length + 1;
    const newItem: LineItem = {
      id: `li-${doc.id}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      document_id: doc.id,
      item_number: nextNumber,
      description: 'New Line Item',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      unit: 'unit',
      source_page: 1,
      created_at: new Date().toISOString(),
    };
    setEditLineItems((prev) => [...prev, newItem]);
  };

  const handleRemoveLineItem = (index: number) => {
    setEditLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const currentFields = isEditing ? editFields : fields;
  const currentLineItems = isEditing ? editLineItems : lineItems;
  const lineItemsTotal = currentLineItems.reduce((acc, li) => acc + (li.amount || 0), 0);

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.78rem', color: 'var(--ds-text-muted)', flexWrap: 'wrap' }}>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isEditing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  className="btn btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                  <span>Save Table Data</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditing}
                  className="btn btn-secondary"
                  disabled={isSaving}
                >
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditing}
                className="btn btn-secondary"
                title="Edit extracted data in table format"
              >
                <Edit3 size={14} color="var(--ds-teal-500)" />
                <span>Edit Table Data</span>
              </button>
            )}

            <button
              onClick={handleGenerateSummary}
              className="btn btn-secondary"
              title="Generate Executive AI Summary"
            >
              <BookOpen size={14} color="var(--ds-teal-500)" />
              <span>AI Executive Summary</span>
            </button>

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

            <a
              href={`/api/documents/${doc.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              <Download size={14} />
              <span>Download File</span>
            </a>

            <Link href="/reconciliation" className="btn btn-primary">
              <GitCompareArrows size={14} />
              <span>Reconcile</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Table Edit Status & Alerts */}
      {saveSuccess && (
        <div
          role="status"
          style={{
            background: 'var(--ds-success-bg)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--ds-radius)',
            padding: '12px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={18} color="var(--ds-success)" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-success)' }}>
              Document table data updated and saved successfully!
            </span>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-success)' }}
            aria-label="Dismiss success message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          style={{
            background: 'var(--ds-error-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--ds-radius)',
            padding: '12px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color="var(--ds-error)" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-error)' }}>
              {saveError}
            </span>
          </div>
          <button
            onClick={() => setSaveError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-error)' }}
            aria-label="Dismiss error message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {isEditing && (
        <div
          style={{
            background: 'rgba(13, 148, 136, 0.08)',
            border: '1px solid var(--ds-teal-500)',
            borderRadius: 'var(--ds-radius)',
            padding: '12px 20px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={18} color="var(--ds-teal-500)" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
                Table Editing Mode Active
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)' }}>
                Modify values directly in the table cells. Amounts auto-recalculate from quantity and unit price.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeTab === 'fields' && (
              <button
                type="button"
                onClick={handleAddField}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={14} />
                <span>Add Field Row</span>
              </button>
            )}
            {activeTab === 'lineItems' && (
              <button
                type="button"
                onClick={handleAddLineItem}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={14} />
                <span>Add Item Row</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveChanges}
              className="btn btn-primary btn-sm"
              disabled={isSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
              <span>Save Table Data</span>
            </button>
            <button
              type="button"
              onClick={handleCancelEditing}
              className="btn btn-secondary btn-sm"
              disabled={isSaving}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ds-border)', marginBottom: 20, gap: 24, overflowX: 'auto' }}>
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
            whiteSpace: 'nowrap',
          }}
        >
          <Layers size={16} />
          <span>Extracted Fields</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)', color: 'var(--ds-text-secondary)' }}>
            {currentFields.length}
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
            whiteSpace: 'nowrap',
          }}
        >
          <FileCheck size={16} />
          <span>Line Items</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)', color: 'var(--ds-text-secondary)' }}>
            {currentLineItems.length}
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
            whiteSpace: 'nowrap',
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
            whiteSpace: 'nowrap',
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--ds-border)',
              background: isEditing ? 'rgba(13, 148, 136, 0.04)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Layers size={18} color="var(--ds-teal-500)" />
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text-primary)', margin: 0 }}>
                {isEditing ? `Editing Extracted Fields (${editFields.length} rows)` : `Extracted Fields & Key Attributes (${fields.length})`}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={14} />
                    <span>Add Row</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="btn btn-primary btn-sm"
                    disabled={isSaving}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                    <span>Save Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    className="btn btn-secondary btn-sm"
                    disabled={isSaving}
                  >
                    <X size={14} />
                    <span>Cancel</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditing}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Edit3 size={14} color="var(--ds-teal-500)" />
                  <span>Edit Table Format</span>
                </button>
              )}
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: isEditing ? '22%' : '20%' }}>Field Name</th>
                  <th style={{ width: isEditing ? '25%' : '24%' }}>Extracted Value</th>
                  <th style={{ width: isEditing ? '14%' : '12%' }}>Data Type</th>
                  <th style={{ width: isEditing ? '12%' : '12%' }}>AI Confidence</th>
                  <th style={{ width: isEditing ? '9%' : '8%' }}>Page</th>
                  <th style={{ width: isEditing ? '20%' : '24%' }}>Source Evidence Text</th>
                  {isEditing && <th style={{ width: '6%', textAlign: 'center' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {currentFields.length === 0 ? (
                  <tr>
                    <td colSpan={isEditing ? 7 : 6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted)' }}>
                      No fields found. {isEditing ? 'Click "Add Row" above to create a field.' : 'Click "Edit Table Format" to enter fields manually.'}
                    </td>
                  </tr>
                ) : (
                  currentFields.map((f, index) => (
                    <tr key={f.id || `field-idx-${index}`}>
                      {isEditing ? (
                        <>
                          <td>
                            <input
                              className="table-edit-input"
                              placeholder="e.g. invoice_number"
                              value={f.field_name}
                              onChange={(e) => handleUpdateField(index, 'field_name', e.target.value)}
                              aria-label={`Field name row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              className="table-edit-input"
                              style={{ fontWeight: 600, color: 'var(--ds-teal-500)' }}
                              placeholder="Value..."
                              value={f.field_value ?? ''}
                              onChange={(e) => handleUpdateField(index, 'field_value', e.target.value)}
                              aria-label={`Field value row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <select
                              className="table-edit-input"
                              value={f.field_type}
                              onChange={(e) => handleUpdateField(index, 'field_type', e.target.value)}
                              aria-label={`Field type row ${index + 1}`}
                            >
                              <option value="string">string</option>
                              <option value="currency">currency</option>
                              <option value="date">date</option>
                              <option value="number">number</option>
                              <option value="vendor">vendor</option>
                              <option value="id">id</option>
                              <option value="tax_id">tax_id</option>
                              <option value="terms">terms</option>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                className="table-edit-input"
                                style={{ width: 60 }}
                                value={Math.round((f.confidence ?? 1) * 100)}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleUpdateField(index, 'confidence', isNaN(val) ? 1.0 : val / 100);
                                }}
                                aria-label={`Confidence row ${index + 1}`}
                              />
                              <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>%</span>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              className="table-edit-input"
                              style={{ width: 55 }}
                              value={f.source_page || 1}
                              onChange={(e) => handleUpdateField(index, 'source_page', parseInt(e.target.value, 10) || 1)}
                              aria-label={`Page row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              className="table-edit-input"
                              placeholder="Direct line match or citation"
                              value={f.source_text ?? ''}
                              onChange={(e) => handleUpdateField(index, 'source_text', e.target.value)}
                              aria-label={`Source evidence row ${index + 1}`}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveField(index)}
                              className="icon-btn"
                              style={{ width: 30, height: 30, margin: '0 auto', color: 'var(--ds-error)' }}
                              title="Delete row"
                              aria-label={`Delete row ${index + 1}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
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
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {isEditing && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ds-border)', background: 'var(--ds-surface)' }}>
              <button
                type="button"
                onClick={handleAddField}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} />
                <span>Add Extracted Field Row</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Line Items Table */}
      {activeTab === 'lineItems' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid var(--ds-border)',
              background: isEditing ? 'rgba(13, 148, 136, 0.04)' : 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileCheck size={18} color="var(--ds-teal-500)" />
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ds-text-primary)', margin: 0 }}>
                {isEditing ? `Editing Line Items (${editLineItems.length} items)` : `Discrete Line Items (${lineItems.length})`}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={14} />
                    <span>Add Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="btn btn-primary btn-sm"
                    disabled={isSaving}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                    <span>Save Table</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    className="btn btn-secondary btn-sm"
                    disabled={isSaving}
                  >
                    <X size={14} />
                    <span>Cancel</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleStartEditing}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Edit3 size={14} color="var(--ds-teal-500)" />
                  <span>Edit Table Format</span>
                </button>
              )}
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: isEditing ? '6%' : '8%' }}>Item #</th>
                  <th style={{ width: isEditing ? '32%' : '32%' }}>Description</th>
                  <th style={{ width: isEditing ? '12%' : '12%' }}>Quantity</th>
                  <th style={{ width: isEditing ? '15%' : '16%' }}>Unit Price</th>
                  <th style={{ width: isEditing ? '16%' : '16%' }}>Amount</th>
                  <th style={{ width: isEditing ? '10%' : '10%' }}>Unit</th>
                  <th style={{ width: isEditing ? '7%' : '6%' }}>Page</th>
                  {isEditing && <th style={{ width: '6%', textAlign: 'center' }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {currentLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={isEditing ? 8 : 7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted)' }}>
                      No discrete line items detected. {isEditing ? 'Click "Add Item" above to add row.' : 'Click "Edit Table Format" to add items.'}
                    </td>
                  </tr>
                ) : (
                  currentLineItems.map((li, index) => (
                    <tr key={li.id || `li-idx-${index}`}>
                      {isEditing ? (
                        <>
                          <td>
                            <input
                              type="number"
                              min="1"
                              className="table-edit-input"
                              style={{ width: 50 }}
                              value={li.item_number || (index + 1)}
                              onChange={(e) => handleUpdateLineItem(index, 'item_number', parseInt(e.target.value, 10) || (index + 1))}
                              aria-label={`Line item number ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              className="table-edit-input"
                              style={{ fontWeight: 600 }}
                              placeholder="Description..."
                              value={li.description ?? ''}
                              onChange={(e) => handleUpdateLineItem(index, 'description', e.target.value)}
                              aria-label={`Description row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="any"
                              className="table-edit-input"
                              placeholder="Qty"
                              value={li.quantity ?? ''}
                              onChange={(e) => handleUpdateLineItem(index, 'quantity', e.target.value)}
                              aria-label={`Quantity row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>₹</span>
                              <input
                                type="number"
                                step="any"
                                className="table-edit-input"
                                placeholder="0.00"
                                value={li.unit_price ?? ''}
                                onChange={(e) => handleUpdateLineItem(index, 'unit_price', e.target.value)}
                                aria-label={`Unit price row ${index + 1}`}
                              />
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>₹</span>
                              <input
                                type="number"
                                step="any"
                                className="table-edit-input"
                                style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}
                                placeholder="0.00"
                                value={li.amount ?? ''}
                                onChange={(e) => handleUpdateLineItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                aria-label={`Amount row ${index + 1}`}
                              />
                            </div>
                          </td>
                          <td>
                            <input
                              className="table-edit-input"
                              placeholder="unit"
                              value={li.unit ?? 'unit'}
                              onChange={(e) => handleUpdateLineItem(index, 'unit', e.target.value)}
                              aria-label={`Unit row ${index + 1}`}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              className="table-edit-input"
                              style={{ width: 50 }}
                              value={li.source_page || 1}
                              onChange={(e) => handleUpdateLineItem(index, 'source_page', parseInt(e.target.value, 10) || 1)}
                              aria-label={`Page row ${index + 1}`}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(index)}
                              className="icon-btn"
                              style={{ width: 30, height: 30, margin: '0 auto', color: 'var(--ds-error)' }}
                              title="Delete line item"
                              aria-label={`Delete line item ${index + 1}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{li.item_number || (index + 1)}</td>
                          <td style={{ fontWeight: 600 }}>{li.description}</td>
                          <td>{li.quantity}</td>
                          <td>₹ {li.unit_price?.toLocaleString('en-IN')}</td>
                          <td style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                            ₹ {li.amount?.toLocaleString('en-IN')}
                          </td>
                          <td>{li.unit || 'unit'}</td>
                          <td>Page {li.source_page || 1}</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {currentLineItems.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--ds-bg)', fontWeight: 700 }}>
                    <td colSpan={isEditing ? 4 : 4} style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--ds-text-secondary)' }}>
                      Total Line Items ({currentLineItems.length}):
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--ds-teal-500)', fontSize: '0.95rem' }}>
                      ₹ {lineItemsTotal.toLocaleString('en-IN')}
                    </td>
                    <td colSpan={isEditing ? 3 : 2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {isEditing && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ds-border)', background: 'var(--ds-surface)' }}>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} />
                <span>Add Line Item Row</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Document Evidence Preview */}
      {activeTab === 'preview' && (
        <div className="document-preview-layout">
          {/* Document Viewer */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--ds-border-light)', paddingBottom: 12 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {doc.file_name} • {doc.page_count ? `${doc.page_count} Page${doc.page_count > 1 ? 's' : ''}` : 'Single page'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={`/api/documents/${doc.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                >
                  <ExternalLink size={12} />
                  <span>Open Original File</span>
                </a>
              </div>
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
                maxHeight: 520,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                color: '#1e293b',
              }}
            >
              {docText ? (
                <div>
                  <div style={{ borderBottom: '2px solid var(--ds-border)', paddingBottom: 8, marginBottom: 16, fontWeight: 700, fontFamily: 'sans-serif', color: 'var(--ds-teal-500)' }}>
                    EXTRACTED DOCUMENT TEXT CONTENT
                  </div>
                  {docText}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--ds-text-secondary)' }}>
                  <FileText size={36} style={{ color: 'var(--ds-text-muted)', margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Original File Stored</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', maxWidth: 400, margin: '0 auto 16px' }}>
                    Document content is saved securely. Text extraction is available for text-based PDFs and OCR-processed images.
                  </div>
                  <a
                    href={`/api/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  >
                    View File ({doc.mime_type})
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Information Box */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>
              Extraction Metadata & Provenance
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
                <span style={{ color: 'var(--ds-text-muted)' }}>AI Extraction Engine:</span>{' '}
                <strong>NVIDIA NIM & Gemini Multimodal</strong>
              </div>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>Source Grounding:</span>{' '}
                <span className="badge badge-success">Direct Document Evidence</span>
              </div>
              <div>
                <span style={{ color: 'var(--ds-text-muted)' }}>Storage Location:</span>{' '}
                <code style={{ fontSize: '0.75rem' }}>{doc.file_path}</code>
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
                  borderLeft: `4px solid ${f.severity === 'high' || f.severity === 'critical' ? 'var(--ds-error)' : 'var(--ds-warning)'}`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--ds-text-primary)' }}>{f.title}</span>
                    <span className={`badge ${f.severity === 'high' || f.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>
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

      {/* AI Summary Modal Dialog */}
      {showSummaryModal && (
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
            padding: 16,
          }}
        >
          <div className="card" style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid var(--ds-border-light)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Sparkles size={20} color="var(--ds-teal-500)" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                  AI Executive Document Briefing
                </h2>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="icon-btn"
                aria-label="Close summary modal"
              >
                <X size={18} />
              </button>
            </div>

            {isLoadingSummary ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-secondary)' }}>
                <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px', color: 'var(--ds-teal-500)' }} />
                <div style={{ fontWeight: 600 }}>Analyzing Document with AI Engine...</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)', marginTop: 4 }}>
                  Synthesizing key commercial obligations and risk profile
                </div>
              </div>
            ) : aiSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 6 }}>
                    Executive Summary
                  </h3>
                  <div
                    style={{
                      background: 'var(--ds-bg)',
                      padding: '12px 16px',
                      borderRadius: 'var(--ds-radius)',
                      fontSize: '0.85rem',
                      lineHeight: 1.6,
                      color: 'var(--ds-text-primary)',
                      borderLeft: '3px solid var(--ds-teal-500)',
                    }}
                  >
                    {aiSummary.summary}
                  </div>
                </div>

                {aiSummary.keyPoints && aiSummary.keyPoints.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 6 }}>
                      Key Commercial Terms
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: 'var(--ds-text-primary)', lineHeight: 1.6 }}>
                      {aiSummary.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiSummary.obligations && aiSummary.obligations.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 6 }}>
                      Contractual Obligations
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem', color: 'var(--ds-text-primary)', lineHeight: 1.6 }}>
                      {aiSummary.obligations.map((ob, i) => (
                        <li key={i}>{ob}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid var(--ds-border-light)',
                    fontSize: '0.75rem',
                    color: 'var(--ds-text-muted)',
                  }}
                >
                  <span>Model: {aiSummary.modelUsed}</span>
                  <span className="badge badge-info">AI-Assisted (Review Required)</span>
                </div>
              </div>
            ) : summaryError ? (
              <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--ds-error)' }}>
                <AlertTriangle size={32} style={{ margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 600 }}>{summaryError}</div>
                <button onClick={handleGenerateSummary} className="btn btn-secondary" style={{ marginTop: 14 }}>
                  Retry Analysis
                </button>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowSummaryModal(false)} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
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
