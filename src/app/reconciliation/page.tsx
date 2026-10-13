'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { ReconciliationGroup } from '@/lib/types';
import {
  GitCompareArrows,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  Layers,
  ArrowRight,
  ExternalLink,
  Calendar,
  Sparkles,
  RefreshCw,
  Eye,
  FileText,
} from 'lucide-react';

export default function ReconciliationPage() {
  const [groups, setGroups] = useState<ReconciliationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ReconciliationGroup | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);
  const [detailTab, setDetailTab] = useState<'field' | 'calculation'>('calculation');

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
      const res = await DataStore.runReconciliationApi();
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'matched':
        return (
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={12} />
            Matched
          </span>
        );
      case 'discrepancy':
        return (
          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} />
            Discrepancy
          </span>
        );
      case 'missing_po':
        return (
          <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FileQuestion size={12} />
            Missing PO
          </span>
        );
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <AppShell>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Reconciliation Workspace</h1>
          <p className="page-subtitle">
            Match, verify and reconcile your documents with business rules, 3-way matching and discrepancy detection.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 'var(--ds-radius)',
              background: 'var(--ds-surface)',
              border: '1px solid var(--ds-border)',
              fontSize: '0.85rem',
              color: 'var(--ds-text-secondary)',
            }}
          >
            <Calendar size={14} />
            <span>Apr 1, 2025 – Apr 30, 2025</span>
          </div>

          <button
            onClick={handleRunReconciliation}
            className="btn btn-primary"
            disabled={isReconciling}
          >
            {isReconciling ? (
              <>
                <RefreshCw size={14} className="spin" />
                <span>Reconciling...</span>
              </>
            ) : (
              <>
                <GitCompareArrows size={14} />
                <span>Run Reconciliation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4 Summary Stat Cards (Matches Image 1 and Image 2 Screen 7) */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Total Groups
            </span>
            <Layers size={18} color="var(--ds-teal-500)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
            {totalGroups}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', marginTop: 4 }}>
            Automated 3-way match
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Matched
            </span>
            <CheckCircle2 size={18} color="var(--ds-success)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-success)' }}>
            {matchedCount} <span style={{ fontSize: '0.9rem', color: 'var(--ds-text-muted)' }}>({((matchedCount / (totalGroups || 1)) * 100).toFixed(0)}%)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            Zero variance detected
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Discrepancies
            </span>
            <AlertTriangle size={18} color="var(--ds-high)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-high)' }}>
            {discrepancyCount} <span style={{ fontSize: '0.9rem', color: 'var(--ds-text-muted)' }}>({((discrepancyCount / (totalGroups || 1)) * 100).toFixed(0)}%)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-high)', marginTop: 4, fontWeight: 500 }}>
            Action required
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Missing Documents
            </span>
            <FileQuestion size={18} color="var(--ds-error)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-error)' }}>
            {missingCount} <span style={{ fontSize: '0.9rem', color: 'var(--ds-text-muted)' }}>({((missingCount / (totalGroups || 1)) * 100).toFixed(0)}%)</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-error)', marginTop: 4, fontWeight: 500 }}>
            Missing PO references
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

      {/* Reconciliation Results Table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Document Group</th>
                <th>Vendor</th>
                <th>Contract Value</th>
                <th>PO Value</th>
                <th>Invoice Value</th>
                <th>Variance</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
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
                      background: isSelected ? 'rgba(13, 148, 136, 0.05)' : undefined,
                    }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 3,
                            border: isSelected ? '5px solid var(--ds-teal-500)' : '1px solid var(--ds-border)',
                            background: 'white',
                          }}
                        />
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
                          ₹ {g.variance.toLocaleString('en-IN')}
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
                        className="btn btn-secondary"
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

      {/* Reconciliation Details Panel (Direct from Image 1 bottom left) */}
      {selectedGroup && (
        <div className="card" style={{ padding: 24, borderTop: '3px solid var(--ds-teal-500)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                Reconciliation Details — {selectedGroup.name}
              </h3>
              {getStatusBadge(selectedGroup.status)}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setDetailTab('calculation')}
                className={`btn ${detailTab === 'calculation' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              >
                Calculation View
              </button>
              <button
                onClick={() => setDetailTab('field')}
                className={`btn ${detailTab === 'field' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              >
                Field View
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
            {/* Left: Field Comparison */}
            <div>
              <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>
                Field Comparison (3-Way Cross Check)
              </h4>
              <table className="table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Document Value</th>
                    <th>System Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Invoice Number</td>
                    <td>INV-5112</td>
                    <td>INV-5112</td>
                    <td><span className="badge badge-success">Matched</span></td>
                  </tr>
                  <tr>
                    <td>Vendor Name</td>
                    <td>{selectedGroup.vendor_name}</td>
                    <td>{selectedGroup.vendor_name}</td>
                    <td><span className="badge badge-success">Matched</span></td>
                  </tr>
                  <tr>
                    <td>Invoice Date</td>
                    <td>Apr 18, 2025</td>
                    <td>Apr 18, 2025</td>
                    <td><span className="badge badge-success">Matched</span></td>
                  </tr>
                  <tr>
                    <td>Total Amount</td>
                    <td style={{ fontWeight: 600, color: 'var(--ds-error)' }}>
                      ₹ {selectedGroup.invoice_value?.toLocaleString('en-IN') || '68,750.00'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      ₹ {selectedGroup.po_value?.toLocaleString('en-IN') || '88,500.00'}
                    </td>
                    <td>
                      {selectedGroup.status === 'matched' ? (
                        <span className="badge badge-success">Matched</span>
                      ) : (
                        <span className="badge badge-error">Mismatch</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Cost Center</td>
                    <td>CC-204</td>
                    <td>CC-203</td>
                    <td><span className="badge badge-warning">Mismatch</span></td>
                  </tr>
                  <tr>
                    <td>PO Number</td>
                    <td>PO-13001</td>
                    <td>PO-13001</td>
                    <td><span className="badge badge-success">Matched</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right: Calculation Details & Evidence Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'var(--ds-bg)',
                  borderRadius: 'var(--ds-radius)',
                  padding: 16,
                  border: '1px solid var(--ds-border-light)',
                }}
              >
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text-secondary)', marginBottom: 12 }}>
                  Calculation Breakdown
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-muted)' }}>Expected Amount (from PO):</span>
                    <strong>₹ {selectedGroup.po_value?.toLocaleString('en-IN') || '75,000.00'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-muted)' }}>Estimated Tax (18%):</span>
                    <strong>₹ 13,500.00</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--ds-border)', paddingTop: 6 }}>
                    <span style={{ fontWeight: 600 }}>Total Expected:</span>
                    <strong>₹ {((selectedGroup.po_value || 75000) * 1.18).toLocaleString('en-IN')}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--ds-text-muted)' }}>Document Billed Amount:</span>
                    <strong>₹ {selectedGroup.invoice_value?.toLocaleString('en-IN') || '68,750.00'}</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '2px solid var(--ds-border)',
                      paddingTop: 8,
                      fontWeight: 700,
                    }}
                  >
                    <span>Net Variance:</span>
                    <span style={{ color: selectedGroup.variance ? 'var(--ds-error)' : 'var(--ds-success)' }}>
                      ₹ {selectedGroup.variance?.toLocaleString('en-IN') || '0.00'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supporting Evidence Links */}
              <div
                style={{
                  background: 'var(--ds-bg)',
                  borderRadius: 'var(--ds-radius)',
                  padding: 16,
                  border: '1px solid var(--ds-border-light)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ds-text-secondary)' }}>
                    Supporting Evidence
                  </span>
                  <Link href="/findings/F-001" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                    View Evidence
                  </Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ds-teal-500)' }}>
                    <FileText size={14} />
                    <span>INV-5112.pdf (Page 2)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3b82f6' }}>
                    <FileText size={14} />
                    <span>PO-13001.pdf (Page 1)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
