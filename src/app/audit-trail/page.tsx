'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore, type AuditEvent, type CaseHistoryItem } from '@/lib/data/store';
import {
  History,
  Shield,
  Search,
  Filter,
  Download,
  FolderOpen,
  Calendar,
  Lock,
  User,
  Clock,
  ArrowRight,
  FileText,
  AlertTriangle,
  GitCompareArrows,
} from 'lucide-react';
import { format } from 'date-fns';

export default function AuditTrailPage() {
  const [activeTab, setActiveTab] = useState<'caseHistory' | 'auditLog'>('caseHistory');
  const [caseHistory, setCaseHistory] = useState<CaseHistoryItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('all');

  useEffect(() => {
    setCaseHistory(DataStore.getCaseHistory());
    setAuditEvents(DataStore.getAuditEvents());

    DataStore.fetchAuditTrail()
      .then((data) => {
        if (data) {
          if (data.caseHistory) setCaseHistory(data.caseHistory);
          if (data.auditEvents) setAuditEvents(data.auditEvents);
        }
      })
      .catch((err) => console.error('Failed to fetch audit trail:', err));
  }, []);

  const filteredCases = caseHistory.filter(
    (c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAuditEvents = auditEvents.filter((ev) => {
    const matchesAction = filterAction === 'all' || ev.action.toLowerCase().includes(filterAction.toLowerCase());
    const matchesSearch =
      !searchQuery ||
      ev.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.entity_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const handleExportAudit = () => {
    const headers = ['Event ID', 'Timestamp', 'User', 'Action', 'Entity Type', 'Entity Title', 'Details'];
    const rows = filteredAuditEvents.map((ev) => [
      ev.id,
      ev.created_at,
      `"${ev.user_name}"`,
      `"${ev.action}"`,
      ev.entity_type,
      `"${ev.entity_title.replace(/"/g, '""')}"`,
      `"${ev.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DocuSentinel_AuditTrail_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Open':
        return <span className="badge badge-info">Open</span>;
      case 'In Review':
        return <span className="badge badge-warning">In Review</span>;
      case 'Resolved':
        return <span className="badge badge-success">Resolved</span>;
      case 'Archived':
        return <span className="badge" style={{ background: 'var(--ds-bg)', color: 'var(--ds-text-muted)' }}>Archived</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Case History & Audit Trail</h1>
          <p className="page-subtitle">
            Cryptographically timestamped compliance logging and case lifecycle history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleExportAudit} className="btn btn-secondary">
            <Download size={15} />
            <span>Export Audit Trail</span>
          </button>
        </div>
      </div>

      {/* Security & Immutability Badge */}
      <div
        style={{
          background: 'var(--ds-surface)',
          border: '1px solid var(--ds-border)',
          borderRadius: 'var(--ds-radius)',
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--ds-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Lock size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--ds-text-primary)' }}>
              Immutable Compliance Audit Trail
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
              Events are write-only and tamper-evident. Ordinary users cannot edit or delete audit logs.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-success">Tamper-Proof</span>
          <span className="badge badge-info">SOC2 / ISO 27001 Ready</span>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--ds-border)', marginBottom: 20, gap: 24 }}>
        <button
          onClick={() => setActiveTab('caseHistory')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'caseHistory' ? 600 : 500,
            color: activeTab === 'caseHistory' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'caseHistory' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FolderOpen size={16} />
          <span>Case History</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)' }}>
            {caseHistory.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('auditLog')}
          style={{
            padding: '10px 0',
            border: 'none',
            background: 'none',
            fontSize: '0.88rem',
            fontWeight: activeTab === 'auditLog' ? 600 : 500,
            color: activeTab === 'auditLog' ? 'var(--ds-teal-500)' : 'var(--ds-text-muted)',
            borderBottom: activeTab === 'auditLog' ? '2px solid var(--ds-teal-500)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <History size={16} />
          <span>Chronological Audit Log</span>
          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 10, background: 'var(--ds-bg)' }}>
            {auditEvents.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Case History Table (Matches Image 2 Screen 11) */}
      {activeTab === 'caseHistory' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Case Name</th>
                  <th>Documents</th>
                  <th>Findings</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FolderOpen size={18} color="var(--ds-teal-500)" />
                        <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                          {c.name}
                        </span>
                      </div>
                    </td>

                    <td style={{ fontSize: '0.85rem' }}>{c.documents_count} files</td>

                    <td>
                      {c.findings_count > 0 ? (
                        <span className="badge badge-warning">{c.findings_count}</span>
                      ) : (
                        <span className="badge badge-success">0</span>
                      )}
                    </td>

                    <td>{getStatusBadge(c.status)}</td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--ds-text-muted)' }}>
                      {c.last_updated}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href="/reconciliation"
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Chronological Audit Events */}
      {activeTab === 'auditLog' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filter Bar */}
          <div className="card" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ width: 320 }}>
                <Search size={16} style={{ color: 'var(--ds-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search audit events by user, action, or note..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                <Filter size={14} color="var(--ds-text-muted)" />
                <span style={{ color: 'var(--ds-text-secondary)' }}>Action Type:</span>
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 'var(--ds-radius)',
                    border: '1px solid var(--ds-border)',
                    background: 'var(--ds-surface)',
                    fontSize: '0.82rem',
                  }}
                >
                  <option value="all">All Actions</option>
                  <option value="upload">Uploads</option>
                  <option value="extraction">Extractions</option>
                  <option value="reconciliation">Reconciliations</option>
                  <option value="review">Reviews</option>
                </select>
              </div>
            </div>
          </div>

          {/* Audit Events List */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User / Actor</th>
                    <th>Action</th>
                    <th>Target Entity</th>
                    <th>Audit Details & Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditEvents.map((ev) => (
                    <tr key={ev.id}>
                      <td style={{ fontSize: '0.78rem', color: 'var(--ds-text-muted)', whiteSpace: 'nowrap' }}>
                        {format(new Date(ev.created_at), 'yyyy-MM-dd HH:mm:ss')}
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={14} color="var(--ds-text-muted)" />
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{ev.user_name}</span>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            ev.action.includes('Reviewed')
                              ? 'badge-success'
                              : ev.action.includes('Finding')
                              ? 'badge-error'
                              : 'badge-info'
                          }`}
                        >
                          {ev.action}
                        </span>
                      </td>

                      <td style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {ev.entity_title}
                      </td>

                      <td style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', maxWidth: 360 }}>
                        {ev.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
