'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { DataStore } from '@/lib/data/store';
import type { Finding, FindingSeverity, FindingStatus } from '@/lib/types';
import {
  AlertTriangle,
  Search,
  Filter,
  Download,
  Eye,
  CheckCircle,
  FileText,
  ArrowRight,
  ArrowUpDown,
  ShieldAlert,
  ClipboardCheck,
} from 'lucide-react';
import { format } from 'date-fns';

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'severity' | 'impact' | 'newest' | 'oldest'>('severity');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setFindings(DataStore.getFindings());
    setIsLoading(true);
    DataStore.fetchFindings()
      .then((data) => {
        if (data) setFindings(data);
      })
      .catch((err) => console.error('Failed to fetch findings:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const totalCount = findings.length;
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;

  const severityPills = [
    { key: 'all', label: 'All Findings', count: totalCount },
    { key: 'critical', label: 'Critical', count: criticalCount, color: 'var(--ds-critical)' },
    { key: 'high', label: 'High', count: highCount, color: 'var(--ds-high)' },
    { key: 'medium', label: 'Medium', count: mediumCount, color: 'var(--ds-medium)' },
    { key: 'low', label: 'Low', count: lowCount, color: 'var(--ds-low)' },
  ];

  const severityRank = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };

  const filteredFindings = findings
    .filter((f) => {
      const matchesSeverity = selectedSeverity === 'all' || f.severity === selectedSeverity;
      const matchesStatus = selectedStatus === 'all' || f.status === selectedStatus;
      const matchesSearch =
        !searchQuery ||
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.reason && f.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (f.source_document_id && f.source_document_id.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesSeverity && matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'severity') {
        const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
        if (diff !== 0) return diff;
        return (b.financial_impact || 0) - (a.financial_impact || 0);
      }
      if (sortBy === 'impact') {
        return (b.financial_impact || 0) - (a.financial_impact || 0);
      }
      if (sortBy === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return 0;
    });

  const handleExportCSV = () => {
    const headers = [
      'Finding ID',
      'Title',
      'Severity',
      'Status',
      'Financial Impact (INR)',
      'Observed Value',
      'Expected Value',
      'Source Document',
      'Page',
      'Reason',
      'Review Decision',
      'Created At',
    ];
    const rows = filteredFindings.map((f) => [
      f.id,
      `"${f.title.replace(/"/g, '""')}"`,
      f.severity.toUpperCase(),
      f.status.toUpperCase(),
      f.financial_impact || 0,
      `"${f.source_value || ''}"`,
      `"${f.compared_value || ''}"`,
      `"${f.source_document_id || ''}"`,
      f.source_page || 1,
      `"${(f.reason || '').replace(/"/g, '""')}"`,
      `"${f.review_decision || 'Unreviewed'}"`,
      f.created_at,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DocuSentinel_Findings_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderSeverityBadge = (severity: FindingSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="badge badge-critical" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="badge badge-high" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            High
          </span>
        );
      case 'medium':
        return (
          <span className="badge badge-medium" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            Medium
          </span>
        );
      case 'low':
      case 'info':
        return (
          <span className="badge badge-low" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            Low
          </span>
        );
      default:
        return <span className="badge">{severity}</span>;
    }
  };

  const renderStatusBadge = (status: FindingStatus, isReviewed?: boolean, decision?: string | null) => {
    if (isReviewed) {
      if (decision === 'accepted') {
        return <span className="badge badge-success">Confirmed Anomaly</span>;
      }
      if (decision === 'rejected') {
        return <span className="badge badge-secondary">Dismissed / False Positive</span>;
      }
      return <span className="badge badge-warning">Review In Progress</span>;
    }

    switch (status) {
      case 'open':
        return <span className="badge badge-info">Suspected Anomaly</span>;
      case 'reviewing':
        return <span className="badge badge-warning">Pending Review</span>;
      case 'resolved':
      case 'accepted':
        return <span className="badge badge-success">Resolved</span>;
      case 'rejected':
        return <span className="badge badge-secondary">Dismissed</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Discrepancy Findings Matrix</h1>
          <p className="page-subtitle">
            Forensic rules, detected anomalies, expected vs. billed values, and verified source citations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={15} />
            <span>Export CSV</span>
          </button>
          <Link href="/review-queue" className="btn btn-primary">
            <ClipboardCheck size={15} />
            <span>Open Review Queue</span>
          </Link>
        </div>
      </div>

      {/* Severity Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {severityPills.map((pill) => (
          <button
            key={pill.key}
            onClick={() => setSelectedSeverity(pill.key)}
            className={`btn ${selectedSeverity === pill.key ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '6px 14px',
              fontSize: '0.8rem',
              borderRadius: 20,
              whiteSpace: 'nowrap',
              fontWeight: selectedSeverity === pill.key ? 600 : 400,
            }}
          >
            {pill.label}
            <span
              style={{
                marginLeft: 6,
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: '0.7rem',
                background: selectedSeverity === pill.key ? 'rgba(255,255,255,0.25)' : 'var(--ds-border)',
                color: selectedSeverity === pill.key ? 'white' : 'var(--ds-text-secondary)',
              }}
            >
              {pill.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter, Search, and Sort Bar */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 340 }}>
            <Search size={16} style={{ color: 'var(--ds-text-muted)' }} />
            <input
              type="text"
              placeholder="Search findings by ID, title, rule, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
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
                <option value="open">Open (Unreviewed)</option>
                <option value="reviewing">In Review</option>
                <option value="resolved">Resolved / Confirmed</option>
                <option value="rejected">Dismissed</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--ds-text-secondary)' }}>
              <ArrowUpDown size={14} />
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 'var(--ds-radius)',
                  border: '1px solid var(--ds-border)',
                  background: 'var(--ds-surface)',
                  color: 'var(--ds-text-primary)',
                  fontSize: '0.82rem',
                }}
              >
                <option value="severity">Severity (Highest First)</option>
                <option value="impact">Financial Impact (Highest)</option>
                <option value="newest">Newest Detected</option>
                <option value="oldest">Oldest Detected</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>ID & Rule</th>
                <th>Finding Title & Forensic Reason</th>
                <th>Observed vs. Expected</th>
                <th>Financial Exposure</th>
                <th>Severity</th>
                <th>Triage Status</th>
                <th>Evidence Reference</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--ds-text-muted)' }}>
                    <AlertTriangle size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)', marginBottom: 4 }}>
                      No findings match criteria
                    </div>
                    <p style={{ fontSize: '0.8rem' }}>
                      Clear your filter parameters to inspect all detected audit issues.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredFindings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--ds-teal-500)' }}>
                          {f.id}
                        </span>
                        <div style={{ fontSize: '0.68rem', color: 'var(--ds-text-muted)', fontFamily: 'monospace' }}>
                          {f.rule_id || f.finding_type}
                        </div>
                      </div>
                    </td>

                    <td>
                      <Link
                        href={`/findings/${f.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'var(--ds-text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                          display: 'block',
                          maxWidth: 280,
                        }}
                      >
                        {f.title}
                      </Link>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--ds-text-secondary)',
                          marginTop: 3,
                          maxWidth: 320,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={f.description}
                      >
                        {f.description}
                      </div>
                    </td>

                    <td>
                      {f.source_value || f.compared_value ? (
                        <div style={{ fontSize: '0.78rem' }}>
                          <div>
                            <span style={{ color: 'var(--ds-text-muted)' }}>Observed: </span>
                            <strong style={{ color: 'var(--ds-error)' }}>{f.source_value || 'None'}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--ds-text-muted)' }}>Expected: </span>
                            <strong>{f.compared_value || 'None'}</strong>
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--ds-text-muted)', fontSize: '0.78rem' }}>Categorical flag</span>
                      )}
                    </td>

                    <td>
                      {f.financial_impact !== null && f.financial_impact !== undefined ? (
                        <span style={{ fontWeight: 700, color: 'var(--ds-error)', fontSize: '0.86rem' }}>
                          ₹ {f.financial_impact.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ds-text-muted)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>

                    <td>{renderSeverityBadge(f.severity)}</td>

                    <td>{renderStatusBadge(f.status, f.is_reviewed, f.review_decision)}</td>

                    <td style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={14} color="var(--ds-teal-500)" style={{ flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                          {f.source_document_id || 'Document'}
                        </span>
                        {f.source_page && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', background: 'var(--ds-bg)', padding: '1px 5px', borderRadius: 3 }}>
                            p.{f.source_page}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/findings/${f.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        <Eye size={12} />
                        <span>Inspect Evidence</span>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
