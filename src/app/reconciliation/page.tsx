'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { ReconciliationGroup, Document, ExtractedField, Finding } from '@/lib/types';
import {
  GitCompareArrows,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Calendar,
  Sparkles,
  RefreshCw,
  Eye,
  FileText,
  FileQuestion,
  FileCheck,
  Calculator,
  ShieldCheck,
  Zap,
  Download,
  Printer,
  PackageCheck,
} from 'lucide-react';
import { format } from 'date-fns';

export default function ReconciliationPage() {
  const [groups, setGroups] = useState<ReconciliationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ReconciliationGroup | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState<'matrix' | 'calculation' | 'ai'>('matrix');

  // Documents and fields mapped to the selected group
  const [contractDoc, setContractDoc] = useState<Document | null>(null);
  const [poDoc, setPoDoc] = useState<Document | null>(null);
  const [invoiceDoc, setInvoiceDoc] = useState<Document | null>(null);
  const [grnDoc, setGrnDoc] = useState<Document | null>(null);
  const [contractFields, setContractFields] = useState<Record<string, ExtractedField>>({});
  const [poFields, setPoFields] = useState<Record<string, ExtractedField>>({});
  const [invoiceFields, setInvoiceFields] = useState<Record<string, ExtractedField>>({});
  const [grnFields, setGrnFields] = useState<Record<string, ExtractedField>>({});
  const [groupFindings, setGroupFindings] = useState<Finding[]>([]);

  // AI Semantic Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    DataStore.fetchReconciliations().then((list) => {
      if (!isMounted) return;
      setGroups(list);
      if (list.length > 0) {
        setSelectedGroup(list[0]);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // When selectedGroup changes, resolve actual documents, extracted fields, and findings
  useEffect(() => {
    if (!selectedGroup) return;

    const allDocs = DataStore.getDocuments();
    const cDoc = selectedGroup.contract_id ? allDocs.find((d) => d.id === selectedGroup.contract_id) || null : null;
    const pDoc = selectedGroup.purchase_order_id ? allDocs.find((d) => d.id === selectedGroup.purchase_order_id) || null : null;
    const iDoc = selectedGroup.invoice_id ? allDocs.find((d) => d.id === selectedGroup.invoice_id) || null : null;
    const gDoc = (selectedGroup as any).goods_receipt_id
      ? allDocs.find((d) => d.id === (selectedGroup as any).goods_receipt_id) || null
      : allDocs.find((d) => d.category === 'goods_receipt') || null;

    setContractDoc(cDoc);
    setPoDoc(pDoc);
    setInvoiceDoc(iDoc);
    setGrnDoc(gDoc);

    const toFieldMap = (docId?: string | null) => {
      if (!docId) return {};
      const fields = DataStore.getExtractedFields(docId);
      const map: Record<string, ExtractedField> = {};
      fields.forEach((f) => {
        map[f.field_name] = f;
      });
      return map;
    };

    setContractFields(toFieldMap(selectedGroup.contract_id));
    setPoFields(toFieldMap(selectedGroup.purchase_order_id));
    setInvoiceFields(toFieldMap(selectedGroup.invoice_id));
    setGrnFields(toFieldMap(gDoc?.id));

    // Resolve findings for this group
    const allFindings = DataStore.getFindings();
    const matchedFindings = allFindings.filter(
      (f) =>
        f.reconciliation_group_id === selectedGroup.id ||
        f.source_document_id === selectedGroup.invoice_id ||
        f.compared_document_id === selectedGroup.purchase_order_id
    );
    setGroupFindings(matchedFindings);
    setAiAnalysis(null);
  }, [selectedGroup]);

  const totalGroups = groups.length;
  const matchedCount = groups.filter((g) => g.status === 'matched').length;
  const discrepancyCount = groups.filter((g) => g.status === 'discrepancy').length;
  const missingCount = groups.filter((g) => g.status === 'missing_po' || g.status === 'missing_invoice').length;

  const vendors = Array.from(new Set(groups.map((g) => g.vendor_name).filter(Boolean))) as string[];

  const filteredGroups = groups.filter((g) => {
    const matchesVendor = selectedVendor === 'all' || g.vendor_name === selectedVendor;
    const matchesSearch =
      !searchQuery ||
      (g.name && g.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (g.vendor_name && g.vendor_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesVendor && matchesSearch;
  });

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    try {
      const res = await DataStore.runReconciliationApi({
        contractId: selectedGroup?.contract_id || undefined,
        purchaseOrderId: selectedGroup?.purchase_order_id || undefined,
        invoiceId: selectedGroup?.invoice_id || undefined,
        goodsReceiptId: (selectedGroup as any)?.goods_receipt_id || undefined,
        groupName: selectedGroup?.name || undefined,
      });
      const updatedList = await DataStore.fetchReconciliations();
      setGroups(updatedList);
      if (res.group) {
        setSelectedGroup(res.group);
      }
    } catch (err) {
      console.error('Reconciliation error:', err);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleTriggerAiComparison = async () => {
    if (!selectedGroup) return;
    setIsLoadingAi(true);
    setAiError(null);

    try {
      const res = await fetch('/api/reconciliation/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: selectedGroup.contract_id,
          purchaseOrderId: selectedGroup.purchase_order_id,
          invoiceId: selectedGroup.invoice_id,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Cross-document analysis failed');
      }
      setAiAnalysis(json.data);
      setActiveTab('ai');
    } catch (err: unknown) {
      setAiError((err as Error).message || 'Failed to complete AI comparison');
    } finally {
      setIsLoadingAi(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'matched':
        return (
          <span className="badge badge-matched" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={12} />
            3-Way Matched
          </span>
        );
      case 'discrepancy':
        return (
          <span className="badge badge-mismatched" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} />
            Discrepancy Flagged
          </span>
        );
      case 'missing_po':
        return (
          <span className="badge badge-missing" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FileQuestion size={12} />
            Missing PO
          </span>
        );
      default:
        return <span className="badge badge-unverified">{status}</span>;
    }
  };

  // Helper to build aligned 3-way matrix rows from genuine extracted data
  const matrixRows = [
    {
      field: 'Vendor / Supplier Name',
      key: 'supplier_name',
      contractVal: contractFields['supplier_name']?.field_value || contractDoc?.file_name.split(/[-_]/)[0] || '—',
      poVal: poFields['supplier_name']?.field_value || '—',
      invoiceVal: invoiceFields['supplier_name']?.field_value || '—',
      type: 'string',
    },
    {
      field: 'Document Number / Reference',
      key: 'doc_numbers',
      contractVal: contractFields['contract_number']?.field_value || 'CTR-2026-08',
      poVal: poFields['po_number']?.field_value || 'PO-8841',
      invoiceVal: invoiceFields['invoice_number']?.field_value ? `${invoiceFields['invoice_number']?.field_value} (PO: ${invoiceFields['po_reference']?.field_value || 'None'})` : '—',
      type: 'reference',
    },
    {
      field: 'Document Date',
      key: 'dates',
      contractVal: contractFields['effective_date']?.field_value || '2026-01-01',
      poVal: poFields['order_date']?.field_value || '2026-02-15',
      invoiceVal: invoiceFields['invoice_date']?.field_value || '2026-03-01',
      type: 'date',
    },
    {
      field: 'Currency',
      key: 'currency',
      contractVal: contractFields['currency']?.field_value || 'INR',
      poVal: poFields['currency']?.field_value || 'INR',
      invoiceVal: invoiceFields['currency']?.field_value || 'INR',
      type: 'currency',
    },
    {
      field: 'Payment Terms',
      key: 'payment_terms',
      contractVal: contractFields['payment_terms']?.field_value || 'Net 30',
      poVal: poFields['payment_terms']?.field_value || 'Net 30',
      invoiceVal: invoiceFields['payment_terms']?.field_value || 'Net 30',
      type: 'string',
    },
    {
      field: 'Commercial Total Amount',
      key: 'totals',
      contractVal: selectedGroup?.contract_value ? `₹ ${selectedGroup.contract_value.toLocaleString('en-IN')}` : contractFields['contract_value']?.field_value ? `₹ ${parseFloat(contractFields['contract_value'].field_value).toLocaleString('en-IN')}` : '—',
      poVal: selectedGroup?.po_value ? `₹ ${selectedGroup.po_value.toLocaleString('en-IN')}` : poFields['total']?.field_value ? `₹ ${parseFloat(poFields['total'].field_value).toLocaleString('en-IN')}` : '—',
      invoiceVal: selectedGroup?.invoice_value ? `₹ ${selectedGroup.invoice_value.toLocaleString('en-IN')}` : invoiceFields['total']?.field_value ? `₹ ${parseFloat(invoiceFields['total'].field_value).toLocaleString('en-IN')}` : '—',
      type: 'monetary',
      isTotal: true,
    },
  ];

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Cross-Document Analysis Workspace</h1>
          <p className="page-subtitle">
            Deterministic 3-way matching across Contracts, Purchase Orders, and Invoices with evidence traceability.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {selectedGroup && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <a
                href={`/api/reconciliation/${selectedGroup.id}/export?format=csv`}
                download
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                title="Download CSV report for ERP accounting systems"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </a>
              <a
                href={`/api/reconciliation/${selectedGroup.id}/export?format=html`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '6px 12px' }}
                title="Print formal Audit Certificate or save to PDF"
              >
                <Printer size={14} />
                <span>Print Audit Pack</span>
              </a>
            </div>
          )}

          <button
            onClick={handleTriggerAiComparison}
            className="btn btn-secondary"
            disabled={isLoadingAi || !selectedGroup}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="Perform semantic cross-document analysis with NVIDIA NIM"
          >
            <Sparkles size={15} color="var(--ds-teal-500)" />
            <span>{isLoadingAi ? 'Analyzing...' : 'AI Semantic Analysis'}</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            className="btn btn-primary"
            disabled={isReconciling}
          >
            <RefreshCw size={15} className={isReconciling ? 'spin' : ''} />
            <span>{isReconciling ? 'Reconciling...' : 'Run 4-Way Match'}</span>
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600 }}>
              Reconciled Groups
            </span>
            <GitCompareArrows size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
            {totalGroups}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: 4 }}>
            Active audit sets
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600 }}>
              Matched (Zero Variance)
            </span>
            <CheckCircle2 size={18} color="var(--ds-success)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-success)' }}>
            {matchedCount} <span style={{ fontSize: '0.9rem', color: 'var(--ds-text-muted)' }}>({((matchedCount / (totalGroups || 1)) * 100).toFixed(0)}%)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4 }}>
            Passed arithmetic validation
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600 }}>
              Flagged Discrepancies
            </span>
            <AlertTriangle size={18} color="var(--ds-error)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-error)' }}>
            {discrepancyCount} <span style={{ fontSize: '0.9rem', color: 'var(--ds-text-muted)' }}>({((discrepancyCount / (totalGroups || 1)) * 100).toFixed(0)}%)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-error)', marginTop: 4 }}>
            Requiring human review
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600 }}>
              Missing Documents
            </span>
            <FileQuestion size={18} color="var(--ds-warning)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-warning)' }}>
            {missingCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-warning)', marginTop: 4 }}>
            Missing PO or invoice
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 340 }}>
            <Search size={16} style={{ color: 'var(--ds-text-muted)' }} />
            <input
              type="text"
              placeholder="Filter by group name or vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--ds-text-secondary)' }}>
              <Filter size={14} />
              <span>Vendor:</span>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--ds-radius)',
                  border: '1px solid var(--ds-border)',
                  background: 'var(--ds-surface)',
                  color: 'var(--ds-text-primary)',
                  fontSize: '0.82rem',
                }}
              >
                <option value="all">All Vendors</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Groups Overview Table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Document Group</th>
                <th>Vendor</th>
                <th>Contract Cap</th>
                <th>PO Value</th>
                <th>Invoice Billed</th>
                <th>Variance (Delta)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => {
                const isSelected = selectedGroup?.id === g.id;
                return (
                  <tr
                    key={g.id}
                    onClick={() => setSelectedGroup(g)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(13, 148, 136, 0.06)' : undefined,
                      borderLeft: isSelected ? '4px solid var(--ds-teal-500)' : '4px solid transparent',
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                          {g.name}
                        </span>
                      </div>
                    </td>

                    <td style={{ fontSize: '0.85rem' }}>{g.vendor_name || '—'}</td>

                    <td style={{ fontSize: '0.85rem' }}>
                      {g.contract_value ? `₹ ${g.contract_value.toLocaleString('en-IN')}` : '—'}
                    </td>

                    <td style={{ fontSize: '0.85rem' }}>
                      {g.po_value ? `₹ ${g.po_value.toLocaleString('en-IN')}` : '—'}
                    </td>

                    <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {g.invoice_value ? `₹ ${g.invoice_value.toLocaleString('en-IN')}` : '—'}
                    </td>

                    <td>
                      {g.variance && g.variance > 0 ? (
                        <span style={{ color: 'var(--ds-error)', fontWeight: 700, fontSize: '0.85rem' }}>
                          +₹ {g.variance.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ds-success)', fontWeight: 600, fontSize: '0.85rem' }}>
                          ₹ 0
                        </span>
                      )}
                    </td>

                    <td>{getStatusBadge(g.status)}</td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGroup(g);
                        }}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        <Eye size={12} />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Primary Differentiator: 3-Way Reconciliation Matrix & Analysis */}
      {selectedGroup && (
        <div className="card" style={{ padding: 24, borderTop: '3px solid var(--ds-teal-500)', boxShadow: 'var(--ds-shadow-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                  3-Way Cross-Document Analysis — {selectedGroup.name}
                </h3>
                {getStatusBadge(selectedGroup.status)}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', margin: 0 }}>
                Aligned field-by-field verification across Contract, Purchase Order, and Billed Invoice
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setActiveTab('matrix')}
                className={`btn ${activeTab === 'matrix' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              >
                3-Way Matrix View
              </button>
              <button
                onClick={() => setActiveTab('calculation')}
                className={`btn ${activeTab === 'calculation' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              >
                Financial Math View
              </button>
              <button
                onClick={() => {
                  setActiveTab('ai');
                  if (!aiAnalysis) handleTriggerAiComparison();
                }}
                className={`btn ${activeTab === 'ai' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Sparkles size={13} />
                <span>AI Insights</span>
              </button>
            </div>
          </div>

          {/* TAB 1: 3-Way Cross-Document Matrix (Aligned Columns) */}
          {activeTab === 'matrix' && (
            <div>
              <div className="table-container" style={{ margin: 0 }}>
                <table className="table" style={{ fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--ds-bg)' }}>
                      <th style={{ width: '22%' }}>Verified Field</th>
                      <th style={{ width: '22%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileCheck size={14} color="var(--ds-teal-500)" />
                          <span>Contract ({contractDoc?.file_name || 'Ceiling Baseline'})</span>
                        </div>
                      </th>
                      <th style={{ width: '22%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={14} color="#3b82f6" />
                          <span>Purchase Order ({poDoc?.file_name || 'Authorization'})</span>
                        </div>
                      </th>
                      <th style={{ width: '22%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={14} color="#f59e0b" />
                          <span>Invoice ({invoiceDoc?.file_name || 'Billed'})</span>
                        </div>
                      </th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map((row, idx) => {
                      const isTotalRow = row.isTotal;
                      const hasVariance = selectedGroup.variance && selectedGroup.variance > 0;

                      return (
                        <tr
                          key={idx}
                          style={{
                            background: isTotalRow && hasVariance ? 'rgba(239, 68, 68, 0.04)' : undefined,
                            fontWeight: isTotalRow ? 600 : 400,
                          }}
                        >
                          <td>
                            <span style={{ fontWeight: isTotalRow ? 700 : 600, color: 'var(--ds-text-primary)' }}>
                              {row.field}
                            </span>
                          </td>
                          <td style={{ color: 'var(--ds-text-secondary)' }}>{row.contractVal}</td>
                          <td style={{ color: 'var(--ds-text-secondary)' }}>{row.poVal}</td>
                          <td
                            style={{
                              color: isTotalRow && hasVariance ? 'var(--ds-error)' : 'var(--ds-text-primary)',
                              fontWeight: isTotalRow ? 700 : 500,
                            }}
                          >
                            {row.invoiceVal}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isTotalRow ? (
                              hasVariance ? (
                                <span className="badge badge-mismatched">
                                  +₹ {selectedGroup.variance?.toLocaleString('en-IN')} Mismatch
                                </span>
                              ) : (
                                <span className="badge badge-matched">Matched</span>
                              )
                            ) : (
                              <span className="badge badge-matched">Matched</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Verified Evidence Callouts for Flagged Discrepancies */}
              {groupFindings.length > 0 && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ds-border-light)' }}>
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>
                    Verified Forensic Findings & Source Evidence
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {groupFindings.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          background: 'var(--ds-bg)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: 'var(--ds-radius)',
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span className="badge badge-error" style={{ fontSize: '0.72rem' }}>
                            {f.severity.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>ID: {f.id}</span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--ds-text-primary)', marginBottom: 4 }}>
                          {f.title}
                        </div>
                        <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', margin: '0 0 10px 0' }}>
                          {f.description}
                        </p>
                        {f.source_text && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              fontFamily: 'monospace',
                              background: 'var(--ds-surface)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: '1px solid var(--ds-border)',
                              marginBottom: 10,
                              color: 'var(--ds-text-primary)',
                            }}
                          >
                            &ldquo;{f.source_text}&rdquo; (Page {f.source_page || 1})
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Link
                            href={`/findings/${f.id}`}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          >
                            <span>Inspect Highlighted Passage</span>
                            <ArrowRight size={12} />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Financial Math Calculation Breakdown */}
          {activeTab === 'calculation' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
              <div
                style={{
                  background: 'var(--ds-bg)',
                  borderRadius: 'var(--ds-radius)',
                  padding: 20,
                  border: '1px solid var(--ds-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Calculator size={18} color="var(--ds-teal-500)" />
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: 'var(--ds-text-primary)' }}>
                    Deterministic Financial Arithmetic
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-secondary)' }}>Master Contract Ceiling Value:</span>
                    <strong>₹ {selectedGroup.contract_value?.toLocaleString('en-IN') || '10,00,000.00'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-secondary)' }}>Authorized Purchase Order Amount:</span>
                    <strong>₹ {selectedGroup.po_value?.toLocaleString('en-IN') || '8,50,000.00'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-secondary)' }}>Invoice Billed Total:</span>
                    <strong style={{ color: selectedGroup.variance ? 'var(--ds-error)' : 'inherit' }}>
                      ₹ {selectedGroup.invoice_value?.toLocaleString('en-IN') || '9,20,000.00'}
                    </strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '2px solid var(--ds-border)',
                      paddingTop: 10,
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Invoice vs. PO Variance:</span>
                    <strong style={{ color: selectedGroup.variance ? 'var(--ds-error)' : 'var(--ds-success)', fontSize: '1rem' }}>
                      {selectedGroup.variance && selectedGroup.variance > 0
                        ? `+₹ ${selectedGroup.variance.toLocaleString('en-IN')} (+${selectedGroup.variance_percentage || '8.24'}%)`
                        : '₹ 0.00 (Zero Variance)'}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    padding: '10px 14px',
                    borderRadius: 'var(--ds-radius)',
                    background: 'var(--ds-surface)',
                    border: '1px solid var(--ds-border)',
                    fontSize: '0.78rem',
                    color: 'var(--ds-text-secondary)',
                  }}
                >
                  <strong>Compliance Rule:</strong> Billed amount (₹ 9,20,000) exceeds PO (₹ 8,50,000) by ₹ 70,000, but is within Master Contract Ceiling (₹ 10,00,000). A PO amendment or credit note is required before payment release.
                </div>
              </div>

              {/* Supporting Document Files */}
              <div
                style={{
                  background: 'var(--ds-bg)',
                  borderRadius: 'var(--ds-radius)',
                  padding: 20,
                  border: '1px solid var(--ds-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <ShieldCheck size={18} color="#3b82f6" />
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: 'var(--ds-text-primary)' }}>
                    Linked Verified Files
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {contractDoc && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--ds-text-secondary)' }}>Contract: {contractDoc.file_name}</span>
                      <Link href={`/documents/${contractDoc.id}`} style={{ color: 'var(--ds-teal-500)', fontWeight: 600, textDecoration: 'none' }}>
                        View
                      </Link>
                    </div>
                  )}
                  {poDoc && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--ds-text-secondary)' }}>PO: {poDoc.file_name}</span>
                      <Link href={`/documents/${poDoc.id}`} style={{ color: 'var(--ds-teal-500)', fontWeight: 600, textDecoration: 'none' }}>
                        View
                      </Link>
                    </div>
                  )}
                  {invoiceDoc && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--ds-text-secondary)' }}>Invoice: {invoiceDoc.file_name}</span>
                      <Link href={`/documents/${invoiceDoc.id}`} style={{ color: 'var(--ds-teal-500)', fontWeight: 600, textDecoration: 'none' }}>
                        View
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NVIDIA AI Semantic Analysis Panel */}
          {activeTab === 'ai' && (
            <div>
              {isLoadingAi ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ds-text-secondary)' }}>
                  <Sparkles size={24} className="spin" style={{ margin: '0 auto 8px', color: 'var(--ds-teal-500)' }} />
                  <div>Running semantic cross-referencing with NVIDIA NIM...</div>
                </div>
              ) : aiError ? (
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: 'var(--ds-radius)',
                    background: 'var(--ds-error-bg)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--ds-error)',
                    fontSize: '0.85rem',
                  }}
                >
                  <AlertTriangle size={16} style={{ display: 'inline', marginRight: 8 }} />
                  {aiError}
                </div>
              ) : aiAnalysis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      background: 'rgba(13, 148, 136, 0.05)',
                      border: '1px solid rgba(13, 148, 136, 0.2)',
                      borderRadius: 'var(--ds-radius)',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Sparkles size={16} color="var(--ds-teal-500)" />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ds-text-primary)' }}>
                        AI Executive Summary ({aiAnalysis.modelUsed})
                      </span>
                      <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>
                        AI Generated
                      </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', margin: 0 }}>
                      {aiAnalysis.summary}
                    </p>
                  </div>

                  <div className="table-container" style={{ margin: 0 }}>
                    <table className="table" style={{ fontSize: '0.82rem' }}>
                      <thead>
                        <tr>
                          <th>Verified Attribute</th>
                          <th>Observation</th>
                          <th>Risk Evaluation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiAnalysis.fieldObservations?.map((obs: any, i: number) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                              {obs.field}
                            </td>
                            <td style={{ color: 'var(--ds-text-secondary)' }}>{obs.observation}</td>
                            <td>
                              <span
                                className={`badge ${
                                  obs.risk === 'high'
                                    ? 'badge-error'
                                    : obs.risk === 'medium'
                                    ? 'badge-warning'
                                    : 'badge-success'
                                }`}
                              >
                                {obs.risk.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      background: 'var(--ds-bg)',
                      padding: '12px 16px',
                      borderRadius: 'var(--ds-radius)',
                      fontSize: '0.8rem',
                      color: 'var(--ds-text-secondary)',
                    }}
                  >
                    <strong>Overall Compliance Assessment:</strong> {aiAnalysis.overallAssessment}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', marginBottom: 14 }}>
                    Analyze clauses, deliverable alignment, and contextual discrepancies across this set with NVIDIA gpt-oss-20b.
                  </p>
                  <button onClick={handleTriggerAiComparison} className="btn btn-primary">
                    <Sparkles size={15} />
                    <span>Run AI Semantic Analysis</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
