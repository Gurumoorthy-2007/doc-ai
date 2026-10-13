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
  Clock,
  Shield,
  FileText,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
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
  const highCount = findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;

  const severityPills = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'high', label: 'High', count: highCount, color: 'var(--ds-error)' },
    { key: 'medium', label: 'Medium', count: mediumCount, color: 'var(--ds-warning)' },
    { key: 'low', label: 'Low', count: lowCount, color: 'var(--ds-success)' },
  ];

  const filteredFindings = findings.filter((f) => {
    const matchesSeverity =
      selectedSeverity === 'all' ||
      (selectedSeverity === 'high' && (f.severity === 'high' || f.severity === 'critical')) ||
      f.severity === selectedSeverity;

    const matchesStatus =
      selectedStatus === 'all' ||
      f.status === selectedStatus;

    const matchesSearch =
      !searchQuery ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.reason && f.reason.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesSeverity && matchesStatus && matchesSearch;
  });

  const handleExportCSV = () => {
    const headers = ['Finding ID', 'Title', 'Severity', 'Status', 'Financial Impact (INR)', 'Source Document', 'Reason', 'Created At'];
    const rows = filteredFindings.map((f) => [
      f.id,
      `"${f.title.replace(/"/g, '""')}"`,
      f.severity.toUpperCase(),
      f.status.toUpperCase(),
      f.financial_impact || 0,
      `"${f.source_document_id || ''}"`,
      `"${(f.reason || '').replace(/"/g, '""')}"`,
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
      case 'high':
        return <span className="badge badge-error">High</span>;
      case 'medium':
        return <span className="badge badge-warning">Medium</span>;
      case 'low':
      case 'info':
        return <span className="badge badge-success">Low</span>;
      default:
        return <span className="badge">{severity}</span>;
    }
  };

  const renderStatusBadge = (status: FindingStatus) => {
    switch (status) {
      case 'open':
        return <span className="badge badge-info">Open</span>;
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
          <h1 className="page-title">Findings</h1>
          <p className="page-subtitle">
            Review and resolve detected anomalies and discrepancies with supporting evidence and source documents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={15} />
            <span>Export Report (CSV)</span>
          </button>
          <Link href="/review-queue" className="btn btn-primary">
            <span>Open Review Queue</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* Severity Filter Pills (Matches Image 1 bottom right and Image 2 Screen 8) */}
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

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div className="search-bar" style={{ width: 340 }}>
            <Search size={16} style={{ color: 'var(--ds-text-muted)' }} />
            <input
              type="text"
              placeholder="Search findings by ID, title, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
                <option value="open">Open</option>
                <option value="reviewing">Pending Review</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Dismissed</option>
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
                <th style={{ width: 80 }}>ID</th>
                <th>Finding</th>
                <th>Amount</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Source Document</th>
                <th>Detected At</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ds-text-muted)' }}>
                    No findings match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredFindings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--ds-teal-500)' }}>
                        {f.id}
                      </span>
                    </td>

                    <td>
                      <Link
                        href={`/findings/${f.id}`}
                        style={{
                          fontWeight: 600,
                          color: 'var(--ds-text-primary)',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                        }}
                      >
                        {f.title}
                      </Link>
                      <div
                        style={{
                          fontSize: '0.73rem',
                          color: 'var(--ds-text-muted)',
                          marginTop: 2,
                          maxWidth: 320,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {f.reason}
                      </div>
                    </td>

                    <td>
                      {f.financial_impact ? (
                        <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)', fontSize: '0.85rem' }}>
                          ₹ {f.financial_impact.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ds-text-muted)' }}>—</span>
                      )}
                    </td>

                    <td>{renderSeverityBadge(f.severity)}</td>

                    <td>{renderStatusBadge(f.status)}</td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FileText size={14} color="var(--ds-teal-500)" />
                        <span>{f.source_document_id || 'Document'}</span>
                      </div>
                    </td>

                    <td style={{ fontSize: '0.8rem', color: 'var(--ds-text-muted)' }}>
                      {format(new Date(f.created_at), 'MMM d, yyyy HH:mm')}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/findings/${f.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        <Eye size={12} />
                        <span>View Evidence</span>
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
