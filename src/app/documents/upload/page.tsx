'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { DocumentCategory, Document } from '@/lib/types';
import {
  UploadCloud,
  FileText,
  FileCheck,
  FileCode,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  X,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  category: DocumentCategory;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

export default function DocumentUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('invoice');
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const categoryPresets: { key: DocumentCategory; label: string; desc: string; icon: any }[] = [
    { key: 'invoice', label: 'Invoices', desc: 'Billing, Invoice', icon: FileText },
    { key: 'purchase_order', label: 'Purchase Orders', desc: 'PO, Work Order', icon: FileCode },
    { key: 'contract', label: 'Contracts', desc: 'Agreement, MSA, SOW', icon: FileCheck },
    { key: 'receipt', label: 'Receipts', desc: 'Payment slips, receipts', icon: FileText },
    { key: 'statement', label: 'Statements', desc: 'Bank, ledger sheets', icon: FileSpreadsheet },
    { key: 'compliance', label: 'Compliance', desc: 'Certifications, audits', icon: ShieldCheck },
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const inferCategory = (fileName: string): DocumentCategory => {
    const lower = fileName.toLowerCase();
    if (lower.includes('inv') || lower.includes('bill')) return 'invoice';
    if (lower.includes('po') || lower.includes('order')) return 'purchase_order';
    if (lower.includes('contract') || lower.includes('agree') || lower.includes('msa') || lower.includes('sow')) return 'contract';
    if (lower.includes('receipt')) return 'receipt';
    if (lower.includes('statement') || lower.includes('sheet') || lower.includes('xls')) return 'statement';
    if (lower.includes('complian') || lower.includes('iso')) return 'compliance';
    return selectedCategory;
  };

  const handleFiles = (files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => ({
      id: `up-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      file,
      name: file.name,
      size: file.size,
      category: inferCategory(file.name),
      progress: 0,
      status: 'pending',
    }));

    setUploadQueue((prev) => [...newItems, ...prev]);
    processQueue(newItems);
  };

  const processQueue = async (items: UploadItem[]) => {
    setIsProcessing(true);

    for (const item of items) {
      try {
        // Stage 1: Uploading & validating
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 25, error: undefined } : i))
        );

        // Stage 2: Server text extraction, OCR & AI analysis
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'processing', progress: 60 } : i))
        );

        const { document } = await DataStore.uploadDocument(item.file, item.category);

        // Stage 3: Completed with real persistent document
        if (document) {
          setUploadQueue((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: 'completed', progress: 100, error: undefined }
                : i
            )
          );
          setCompletedCount((c) => c + 1);
        }
      } catch (err: unknown) {
        const errorMsg = (err as Error).message || 'Processing failed';
        setUploadQueue((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', progress: 0, error: errorMsg }
              : i
          )
        );
      }
    }

    setIsProcessing(false);
  };

  const handleRetryItem = (id: string) => {
    const item = uploadQueue.find((i) => i.id === id);
    if (item) {
      processQueue([item]);
    }
  };

  const handleRemoveItem = (id: string) => {
    setUploadQueue((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Document Upload</h1>
          <p className="page-subtitle">
            Upload and process your business documents with AI-powered classification and OCR extraction.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/documents" className="btn btn-secondary">
            <span>View All Documents</span>
          </Link>
          {completedCount > 0 && (
            <Link href="/reconciliation" className="btn btn-primary">
              <span>Go to Reconciliation</span>
              <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>

      {/* Upload Dropzone Card */}
      <div
        className="card"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          border: dragActive ? '2px dashed var(--ds-teal-500)' : '2px dashed var(--ds-border)',
          backgroundColor: dragActive ? 'rgba(13, 148, 136, 0.04)' : 'var(--ds-surface)',
          borderRadius: 'var(--ds-radius-lg)',
          marginBottom: 24,
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: 'rgba(13, 148, 136, 0.1)',
            color: 'var(--ds-teal-500)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <UploadCloud size={32} />
        </div>

        <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 6 }}>
          Drag & drop files here or <span style={{ color: 'var(--ds-teal-500)', textDecoration: 'underline' }}>click to browse</span>
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)', marginBottom: 16 }}>
          Supports PDF, JPG, PNG, TIFF (Max 50MB per file)
        </p>

        <div style={{ display: 'inline-flex', gap: 8 }}>
          <span className="badge badge-info">Multi-document batch</span>
          <span className="badge badge-success">Automated classification</span>
        </div>
      </div>

      {/* Document Categories Presets (From Image 1 & 2) */}
      <div style={{ marginBottom: 28 }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>
          Document Categories
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          {categoryPresets.map((preset) => {
            const Icon = preset.icon;
            const isSelected = selectedCategory === preset.key;
            return (
              <div
                key={preset.key}
                onClick={() => setSelectedCategory(preset.key)}
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--ds-teal-500)' : '1px solid var(--ds-border)',
                  background: isSelected ? 'rgba(13, 148, 136, 0.04)' : 'var(--ds-surface)',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: isSelected ? 'var(--ds-teal-500)' : 'var(--ds-bg)',
                    color: isSelected ? 'white' : 'var(--ds-teal-500)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px',
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                  {preset.label}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--ds-text-muted)', marginTop: 2 }}>
                  {preset.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upload Progress Section (Matches Image 1) */}
      {uploadQueue.length > 0 && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)', margin: 0 }}>
                Upload Progress
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', margin: '4px 0 0 0' }}>
                Processing {completedCount} of {uploadQueue.length} files
              </p>
            </div>
            {isProcessing && (
              <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={12} className="spin" />
                Active Processing
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  border: '1px solid var(--ds-border-light)',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                  <FileText size={20} color="var(--ds-teal-500)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ds-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)' }}>
                      {(item.size / (1024 * 1024)).toFixed(1)} MB • {item.category.replace('_', ' ')}
                    </div>
                    {item.error && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--ds-error)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={12} />
                        <span>{item.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 220 }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        height: 6,
                        width: '100%',
                        borderRadius: 3,
                        background: 'var(--ds-border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${item.progress}%`,
                          background: item.status === 'completed' ? 'var(--ds-success)' : 'var(--ds-teal-500)',
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ds-text-secondary)', width: 36, textAlign: 'right' }}>
                    {item.progress}%
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 110, justifyContent: 'flex-end' }}>
                  {item.status === 'completed' && (
                    <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} />
                      Completed
                    </span>
                  )}
                  {item.status === 'processing' && (
                    <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={12} className="spin" />
                      Processing
                    </span>
                  )}
                  {item.status === 'uploading' && (
                    <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} />
                      Uploading
                    </span>
                  )}
                  {item.status === 'error' && (
                    <button
                      onClick={() => handleRetryItem(item.id)}
                      className="btn btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--ds-teal-500)' }}
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--ds-text-muted)',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
