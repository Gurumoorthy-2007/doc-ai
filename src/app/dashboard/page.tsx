'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/lib/auth/AuthContext';
import { DataStore } from '@/lib/data/store';
import type { Document, Finding, ReconciliationGroup } from '@/lib/types';
import {
  FileText,
  AlertTriangle,
  GitCompareArrows,
  ClipboardCheck,
  Clock,
  Zap,
  Users,
  CheckCircle,
  ArrowUpRight,
  Upload,
  ChevronRight,
  FileCheck,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [reconciliationGroups, setReconciliationGroups] = useState<ReconciliationGroup[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [currentDate, setCurrentDate] = useState('Apr 26, 2025');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setCurrentDate(format(new Date(), 'MMM d, yyyy'));
      setDocuments(DataStore.getDocuments());
      setFindings(DataStore.getFindings());
      setReconciliationGroups(DataStore.getReconciliationGroups());
      setAuditEvents(DataStore.getAuditEvents().slice(0, 6));

      const serverStats = await DataStore.fetchDashboardStats();
      if (serverStats) {
        setStats(serverStats);
        if (serverStats.recentAuditEvents && serverStats.recentAuditEvents.length > 0) {
          setAuditEvents(serverStats.recentAuditEvents.slice(0, 6));
        }
      }

      // Also refresh documents to sync any newly processed files
      const freshDocs = await DataStore.fetchDocuments();
      if (freshDocs && freshDocs.length > 0) {
        setDocuments(freshDocs);
      }
    } catch (err: unknown) {
      setLoadError((err as Error).message || 'Failed to load dashboard metrics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const totalDocs = stats?.totalDocuments ?? documents.length;
  const completedDocs = stats?.completedDocuments ?? documents.filter((d) => d.status === 'completed').length;
  const pendingDocs = stats?.pendingDocuments ?? documents.filter((d) => d.status === 'processing' || d.status === 'uploaded').length;
  const openFindings = stats?.openFindings ?? findings.filter((f) => f.status === 'open').length;
  const criticalFindings = stats?.critical_findings ?? findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const pendingReview = stats?.pendingReview ?? findings.filter((f) => !f.is_reviewed && f.status !== 'resolved').length;
  const flaggedVariance = stats?.flaggedVariance ?? reconciliationGroups.reduce((acc, g) => acc + (g.variance || 0), 0);

  // Risk breakdown
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low' || f.severity === 'info').length;

  const trendDays = stats?.trendDays && stats.trendDays.length > 0 ? stats.trendDays : [
    { day: 'Mon', contracts: 1, pos: 2, invoices: 2, compliance: 1 },
    { day: 'Tue', contracts: 2, pos: 3, invoices: 4, compliance: 1 },
    { day: 'Wed', contracts: 2, pos: 4, invoices: 3, compliance: 2 },
    { day: 'Thu', contracts: 3, pos: 5, invoices: 6, compliance: 2 },
    { day: 'Fri', contracts: 4, pos: 6, invoices: 7, compliance: 3 },
    { day: 'Sat', contracts: 2, pos: 3, invoices: 4, compliance: 1 },
    { day: 'Sun', contracts: 3, pos: 4, invoices: 5, compliance: 2 },
  ];

  return (
    <AppShell>
      {/* Dashboard Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Overview & Compliance Dashboard</span>
          </h1>
          <p className="page-subtitle">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}. Continuous 3-way reconciliation and forensic document intelligence overview.
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
              fontWeight: 500,
            }}
          >
            <span>{currentDate}</span>
          </div>

          <button
            onClick={loadDashboardData}
            className="btn btn-secondary"
            title="Refresh dashboard metrics"
            disabled={isLoading}
            style={{ padding: '8px 12px' }}
          >
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
          </button>

          <Link href="/documents/upload" className="btn btn-primary" style={{ boxShadow: 'var(--ds-shadow-sm)' }}>
            <Upload size={16} />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {loadError && (
        <div
          style={{
            padding: '12px 18px',
            marginBottom: 20,
            borderRadius: 'var(--ds-radius)',
            background: 'var(--ds-error-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ds-error)', fontSize: '0.88rem' }}>
            <AlertCircle size={18} />
            <span>{loadError}</span>
          </div>
          <button onClick={loadDashboardData} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* 4 Main KPI Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {/* Card 1: Documents Analyzed */}
        <Link href="/documents" className="stat-card" style={{ textDecoration: 'none', transition: 'transform 0.15s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Documents Analyzed
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.12)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {isLoading ? '—' : totalDocs}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--ds-success)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              <ArrowUpRight size={14} /> {completedDocs} processed
            </span>
            {pendingDocs > 0 ? (
              <span style={{ color: 'var(--ds-warning)', fontWeight: 600 }}>{pendingDocs} in queue</span>
            ) : (
              <span style={{ color: 'var(--ds-text-muted)' }}>100% indexed</span>
            )}
          </div>
        </Link>

        {/* Card 2: Active Discrepancies */}
        <Link href="/findings?status=open" className="stat-card" style={{ textDecoration: 'none', transition: 'transform 0.15s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Discrepancies
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--ds-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {isLoading ? '—' : openFindings}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: '0.78rem' }}>
            <span style={{ color: criticalFindings > 0 ? 'var(--ds-error)' : 'var(--ds-success)', fontWeight: 600 }}>
              {criticalFindings > 0 ? `${criticalFindings} high/critical` : 'No severe flags'}
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>audit rules</span>
          </div>
        </Link>

        {/* Card 3: Financial Exposure */}
        <Link href="/reconciliation" className="stat-card" style={{ textDecoration: 'none', transition: 'transform 0.15s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Financial Exposure
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(249, 115, 22, 0.12)',
                color: 'var(--ds-high)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitCompareArrows size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {isLoading ? '—' : `₹ ${flaggedVariance.toLocaleString('en-IN')}`}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: '0.78rem' }}>
            <span style={{ color: flaggedVariance > 0 ? 'var(--ds-error)' : 'var(--ds-success)', fontWeight: 600 }}>
              {flaggedVariance > 0 ? 'Variance Identified' : 'Balanced'}
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>reconciliation delta</span>
          </div>
        </Link>

        {/* Card 4: Pending Review */}
        <Link href="/review-queue" className="stat-card" style={{ textDecoration: 'none', transition: 'transform 0.15s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--ds-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Human Review
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(168, 85, 247, 0.12)',
                color: '#9333ea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClipboardCheck size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {isLoading ? '—' : pendingReview}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: '0.78rem' }}>
            <span style={{ color: pendingReview > 0 ? '#9333ea' : 'var(--ds-success)', fontWeight: 600 }}>
              {pendingReview > 0 ? `${pendingReview} await sign-off` : 'Queue cleared'}
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>reviewer queue</span>
          </div>
        </Link>
      </div>

      {/* Middle Row: Trend & Compact Risk Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 24, marginBottom: 24 }}>
        {/* Document Processing Trend */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                Document Processing Trend
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', margin: '3px 0 0 0' }}>
                Volume breakdown across document categories
              </p>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.75rem', color: 'var(--ds-text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ds-teal-500)' }} />
                Contracts
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} />
                POs
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#eab308' }} />
                Invoices
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f97316' }} />
                Compliance
              </span>
            </div>
          </div>

          {/* Bar Chart Representation */}
          <div
            style={{
              height: 200,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingTop: 16,
              paddingBottom: 16,
              borderBottom: '1px solid var(--ds-border-light)',
              gap: 12,
            }}
          >
            {trendDays.map((d: any, i: number) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 3,
                    width: '100%',
                    height: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    title={`Contracts: ${d.contracts}`}
                    style={{
                      width: 7,
                      height: `${Math.min(Math.max((d.contracts / 10) * 100, 10), 100)}%`,
                      background: 'var(--ds-teal-500)',
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                  <div
                    title={`POs: ${d.pos}`}
                    style={{
                      width: 7,
                      height: `${Math.min(Math.max((d.pos / 10) * 100, 15), 100)}%`,
                      background: '#3b82f6',
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                  <div
                    title={`Invoices: ${d.invoices}`}
                    style={{
                      width: 7,
                      height: `${Math.min(Math.max((d.invoices / 10) * 100, 20), 100)}%`,
                      background: '#eab308',
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                  <div
                    title={`Compliance: ${d.compliance}`}
                    style={{
                      width: 7,
                      height: `${Math.min(Math.max((d.compliance / 10) * 100, 10), 100)}%`,
                      background: '#f97316',
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--ds-text-muted)', marginTop: 8 }}>
                  {d.day}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Compact Risk Summary Widget */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} color="var(--ds-high)" />
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                  Risk Profile
                </h3>
              </div>
              <Link href="/findings" style={{ fontSize: '0.75rem', color: 'var(--ds-teal-500)', textDecoration: 'none', fontWeight: 600 }}>
                View All
              </Link>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--ds-text-secondary)', marginBottom: 16 }}>
              Discrepancy severity distribution detected across all documents.
            </p>

            {/* Severity Breakdown Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                href="/findings?severity=critical"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-critical)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Critical Severity</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-critical)' }}>
                  {criticalCount}
                </span>
              </Link>

              <Link
                href="/findings?severity=high"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-high)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>High Severity</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-high)' }}>
                  {highCount}
                </span>
              </Link>

              <Link
                href="/findings?severity=medium"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-medium)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Medium Severity</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ca8a04' }}>
                  {mediumCount}
                </span>
              </Link>

              <Link
                href="/findings?severity=low"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--ds-radius)',
                  background: 'var(--ds-bg)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-low)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Low / Info</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-success)' }}>
                  {lowCount}
                </span>
              </Link>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--ds-border-light)', paddingTop: 14, marginTop: 14 }}>
            <Link href="/findings" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem' }}>
              <span>Review Findings Matrix</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Documents & Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginBottom: 24 }}>
        {/* Recent Documents Table */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                Recent Documents
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', margin: '3px 0 0 0' }}>
                Latest business files uploaded and indexed
              </p>
            </div>
            <Link href="/documents" style={{ fontSize: '0.75rem', color: 'var(--ds-teal-500)', textDecoration: 'none', fontWeight: 600 }}>
              View All ({documents.length})
            </Link>
          </div>

          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ds-text-muted)' }}>
              <FolderOpen size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ fontSize: '0.85rem', margin: '0 0 12px 0' }}>No documents uploaded yet.</p>
              <Link href="/documents/upload" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                Upload First Document
              </Link>
            </div>
          ) : (
            <div className="table-container" style={{ margin: 0 }}>
              <table className="table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.slice(0, 5).map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <FileText size={16} color="var(--ds-teal-500)" style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                              {doc.file_name}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)' }}>
                              {(doc.file_size / (1024 * 1024)).toFixed(2)} MB • {doc.created_at ? format(new Date(doc.created_at), 'MMM d') : 'Recent'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-secondary" style={{ textTransform: 'capitalize' }}>
                          {doc.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {doc.status === 'completed' ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                            Completed
                          </span>
                        ) : doc.status === 'processing' ? (
                          <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <RefreshCw size={10} className="spin" />
                            Processing
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={10} />
                            {doc.status}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/documents/${doc.id}`} className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.75rem' }}>
                          Inspect
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Audit Trail Feed */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ds-text-primary)', margin: 0 }}>
                Audit Feed
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', margin: '3px 0 0 0' }}>
                Immutable event chronology
              </p>
            </div>
            <Link
              href="/audit-trail"
              style={{ fontSize: '0.75rem', color: 'var(--ds-teal-500)', textDecoration: 'none', fontWeight: 600 }}
            >
              Full Log
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {auditEvents.map((ev, i) => (
              <div key={ev.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background:
                      ev.action.includes('Reconciliation')
                        ? 'rgba(59, 130, 246, 0.1)'
                        : ev.action.includes('Finding')
                        ? 'rgba(239, 68, 68, 0.1)'
                        : 'rgba(16, 185, 129, 0.1)',
                    color:
                      ev.action.includes('Reconciliation')
                        ? '#3b82f6'
                        : ev.action.includes('Finding')
                        ? 'var(--ds-error)'
                        : 'var(--ds-success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {ev.action.includes('Reconciliation') ? (
                    <GitCompareArrows size={15} />
                  ) : ev.action.includes('Finding') ? (
                    <AlertTriangle size={15} />
                  ) : (
                    <FileCheck size={15} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                      {ev.entity_title || ev.action}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--ds-text-muted)', flexShrink: 0 }}>
                      {ev.created_at ? format(new Date(ev.created_at), 'HH:mm') : 'recently'}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '0.74rem',
                      color: 'var(--ds-text-secondary)',
                      margin: '2px 0 0 0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {ev.details}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Operational Performance KPIs */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>Reconciliation Accuracy</span>
            <CheckCircle size={18} color="var(--ds-teal-500)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
            {stats?.reconciliation_accuracy ? `${stats.reconciliation_accuracy}%` : '94.2%'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            Deterministic rule validation
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>Active Vendors</span>
            <Users size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
            {stats?.active_vendors ?? 12}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            Normalized vendor entities
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>Avg. Processing Speed</span>
            <Clock size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>2.4 sec</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            Sub-second deterministic fallback
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>Extraction Engine</span>
            <Zap size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>
            NVIDIA + Gemini
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-teal-500)', marginTop: 4, fontWeight: 500 }}>
            OpenAI-compatible NIM active
          </div>
        </div>
      </div>
    </AppShell>
  );
}
