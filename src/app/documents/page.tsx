'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Document, DocumentCategory, DocumentStatus } from '@/lib/types';
import {
  FileText,
  Upload,
  Search,
  Filter,
  Eye,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  FileSpreadsheet,
  FileCode,
  ArrowUpDown,
  Download,
} from 'lucide-react';
import { format } from 'date-fns';

function DocumentsContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(DataStore.getDocuments());
  }, []);

  const categories: { key: string; label: string; count: number }[] = [
    { key: 'all', label: 'All Documents', count: documents.length },
    { key: 'invoice', label: 'Invoices', count: documents.filter((d) => d.category === 'invoice').length },
    { key: 'purchase_order', label: 'Purchase Orders', count: documents.filter((d) => d.category === 'purchase_order').length },
    { key: 'contract', label: 'Contracts', count: documents.filter((d) => d.category === 'contract').length },
    { key: 'receipt', label: 'Receipts', count: documents.filter((d) => d.category === 'receipt').length },
    { key: 'statement', label: 'Statements', count: documents.filter((d) => d.category === 'statement').length },
    { key: 'compliance', label: 'Compliance', count: documents.filter((d) => d.category === 'compliance').length },
  ];

  const filteredDocuments = documents.filter((doc) => {
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || doc.status === selectedStatus;
    const matchesSearch =
      !searchQuery ||
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  });

  const handleDelete = (id: string) => {
    DataStore.deleteDocument(id);
    setDocuments(DataStore.getDocuments());
    setDeleteConfirmId(null);
  };

  const handleRetryProcessing = (id: string) => {
    DataStore.updateDocumentStatus(id, 'processing');
    setDocuments(DataStore.getDocuments());

    setTimeout(() => {
      DataStore.updateDocumentStatus(id, 'completed');
      setDocuments(DataStore.getDocuments());
    }, 1500);
  };

  const getFileIcon = (category: DocumentCategory, mimeType: string) => {
    if (category === 'statement' || mimeType.includes('sheet')) return <FileSpreadsheet size={18} color="#10b981" />;
    if (category === 'contract') return <FileCheck size={18} color="var(--ds-teal-500)" />;
    if (category === 'invoice') return <FileText size={18} color="#3b82f6" />;
    if (category === 'purchase_order') return <FileCode size={18} color="#8b5cf6" />;
    return <FileText size={18} color="var(--ds-text-secondary)" />;
  };

  const renderStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={10} className="spin" />
            Processing
          </span>
        );
      case 'uploading':
      case 'uploaded':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            Pending
          </span>
        );
      case 'error':
        return (
          <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={10} />
            Error
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            Manage, classify, and extract structured business intelligence from uploaded files.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/documents/upload" className="btn btn-primary">
            <Upload size={16} />
            <span>Upload Documents</span>
          </Link>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 20,
        }}
      >
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`btn ${selectedCategory === cat.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderRadius: 20,
              whiteSpace: 'nowrap',
              fontWeight: selectedCategory === cat.key ? 600 : 400,
            }}
          >
            {cat.label}
            <span
              style={{
                marginLeft: 6,
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: '0.7rem',
                background: selectedCategory === cat.key ? 'rgba(255,255,255,0.25)' : 'var(--ds-border)',
                color: selectedCategory === cat.key ? 'white' : 'var(--ds-text-secondary)',
              }}
            >
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search and Filters Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <div className="search-bar" style={{ width: '100%', maxWidth: 360 }}>
              <Search size={16} style={{ color: 'var(--ds-text-muted)' }} />
              <input
                type="text"
                placeholder="Search by file name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--ds-text-secondary)' }}>
              <Filter size={14} />
              <span>Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--ds-radius)',
                  border: '1px solid var(--ds-border)',
                  background: 'var(--ds-surface)',
                  color: 'var(--ds-text-primary)',
                  fontSize: '0.82rem',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="uploaded">Pending</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Category</th>
                <th>Size</th>
                <th>Status</th>
                <th>Classified As</th>
                <th>Uploaded At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ds-text-muted)' }}>
                    <div style={{ maxWidth: 320, margin: '0 auto' }}>
                      <FileText size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <div style={{ fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 4 }}>
                        No documents found
                      </div>
                      <p style={{ fontSize: '0.8rem', marginBottom: 16 }}>
                        No files match the selected filter criteria. Upload a new document to get started.
                      </p>
                      <Link href="/documents/upload" className="btn btn-primary" style={{ display: 'inline-flex' }}>
                        <Upload size={14} />
                        <span>Upload File</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 6,
                            background: 'var(--ds-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getFileIcon(doc.category, doc.mime_type)}
                        </div>
                        <div>
                          <Link
                            href={`/documents/${doc.id}`}
                            style={{
                              fontWeight: 600,
                              color: 'var(--ds-text-primary)',
                              textDecoration: 'none',
                              fontSize: '0.875rem',
                            }}
                          >
                            {doc.file_name}
                          </Link>
                          {doc.page_count && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)' }}>
                              {doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '0.85rem', color: 'var(--ds-text-secondary)' }}>
                        {doc.category.replace('_', ' ')}
                      </span>
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                      {(doc.file_size / (1024 * 1024)).toFixed(1)} MB
                    </td>

                    <td>{renderStatusBadge(doc.status)}</td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'var(--ds-bg)',
                          color: 'var(--ds-text-secondary)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {doc.classified_as ? doc.classified_as.replace('_', ' ') : 'Auto-detect'}
                      </span>
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                      {format(new Date(doc.created_at), 'MMM d, yyyy HH:mm')}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <Link
                          href={`/documents/${doc.id}`}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          <Eye size={13} />
                          <span>View</span>
                        </Link>

                        {doc.status === 'error' && (
                          <button
                            onClick={() => handleRetryProcessing(doc.id)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--ds-teal-500)' }}
                            title="Retry Processing"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}

                        <button
                          onClick={() => setDeleteConfirmId(doc.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.78rem', color: 'var(--ds-error)' }}
                          title="Delete Document"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
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
          <div className="card" style={{ maxWidth: 420, width: '90%', padding: 24 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8, color: 'var(--ds-error)' }}>
              Confirm Document Deletion
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginBottom: 20 }}>
              Are you sure you want to delete this document? All associated extracted fields and findings will be permanently removed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setDeleteConfirmId(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="btn btn-primary"
                style={{ background: 'var(--ds-error)' }}
              >
                Delete Document
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading documents...</div>}>
      <DocumentsContent />
    </Suspense>
  );
}
