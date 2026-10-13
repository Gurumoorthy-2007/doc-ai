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
  TrendingUp,
  Clock,
  Zap,
  Users,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Upload,
  ChevronRight,
  FileCheck,
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

  useEffect(() => {
    setCurrentDate(format(new Date(), 'MMM d, yyyy'));
    setDocuments(DataStore.getDocuments());
    setFindings(DataStore.getFindings());
    setReconciliationGroups(DataStore.getReconciliationGroups());
    setAuditEvents(DataStore.getAuditEvents().slice(0, 5));

    DataStore.fetchDashboardStats()
      .then((data) => {
        if (data) {
          setStats(data);
          if (data.recentAuditEvents && data.recentAuditEvents.length > 0) {
            setAuditEvents(data.recentAuditEvents.slice(0, 5));
          }
        }
      })
      .catch((err) => console.error('Failed to fetch dashboard stats:', err));
  }, []);

  const totalDocs = stats?.totalDocuments ?? documents.length;
  const completedDocs = stats?.completedDocuments ?? documents.filter((d) => d.status === 'completed').length;
  const openFindings = stats?.openFindings ?? findings.filter((f) => f.status === 'open').length;
  const pendingReview = stats?.pendingReview ?? findings.filter((f) => !f.is_reviewed && f.status !== 'resolved').length;
  const flaggedVariance = stats?.flaggedVariance ?? reconciliationGroups.reduce((acc, g) => acc + (g.variance || 0), 0);

  // Processing trend data
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
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Good morning, {profile?.full_name?.split(' ')[0] || 'Gurumoorthy'}! 👋
          </h1>
          <p className="page-subtitle">
            Here&apos;s what&apos;s happening with your document intelligence and reconciliation today.
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

          <Link href="/documents/upload" className="btn btn-primary">
            <Upload size={16} />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* 4 Main Stat Cards (Image 2 Screen 5) */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {/* Card 1: Documents Analyzed */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Documents Analyzed
            </span>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {totalDocs}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--ds-success)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              <ArrowUpRight size={14} /> {completedDocs} completed
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>saved records</span>
          </div>
        </div>

        {/* Card 2: Open Findings */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Open Findings
            </span>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(13, 148, 136, 0.1)',
                color: 'var(--ds-teal-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {openFindings}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem' }}>
            <span style={{ color: openFindings > 0 ? 'var(--ds-warning)' : 'var(--ds-success)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              {openFindings > 0 ? `${openFindings} active` : '0 issues'}
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>discrepancies</span>
          </div>
        </div>

        {/* Card 3: Flagged Variance */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Flagged Variance
            </span>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(249, 115, 22, 0.1)',
                color: 'var(--ds-high)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitCompareArrows size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            ₹ {flaggedVariance.toLocaleString('en-IN')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem' }}>
            <span style={{ color: flaggedVariance > 0 ? 'var(--ds-error)' : 'var(--ds-success)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              {flaggedVariance > 0 ? 'Reconciliation delta' : 'Fully matched'}
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>total variance</span>
          </div>
        </div>

        {/* Card 4: Pending Review */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              Pending Review
            </span>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: 'rgba(168, 85, 247, 0.1)',
                color: '#a855f7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClipboardCheck size={20} />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--ds-text-primary)', lineHeight: 1.1 }}>
            {pendingReview}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem' }}>
            <span style={{ color: '#a855f7', display: 'flex', alignItems: 'center', fontWeight: 600 }}>
              <ArrowUpRight size={14} /> +50%
            </span>
            <span style={{ color: 'var(--ds-text-muted)' }}>from last week</span>
          </div>
        </div>
      </div>

      {/* Middle Row: Trend Chart & Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Document Processing Trend */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)', margin: 0 }}>
                Document Processing Trend
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)', margin: '4px 0 0 0' }}>
                Volume breakdown across document categories
              </p>
            </div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.75rem' }}>
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
              height: 220,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              paddingTop: 20,
              paddingBottom: 20,
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
                      height: `${(d.contracts / 50) * 100}%`,
                      background: 'var(--ds-teal-500)',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <div
                    title={`POs: ${d.pos}`}
                    style={{
                      width: 7,
                      height: `${(d.pos / 50) * 100}%`,
                      background: '#3b82f6',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <div
                    title={`Invoices: ${d.invoices}`}
                    style={{
                      width: 7,
                      height: `${(d.invoices / 50) * 100}%`,
                      background: '#eab308',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease',
                    }}
                  />
                  <div
                    title={`Compliance: ${d.compliance}`}
                    style={{
                      width: 7,
                      height: `${(d.compliance / 50) * 100}%`,
                      background: '#f97316',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.3s ease',
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

        {/* Recent Activity */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ds-text-primary)', margin: 0 }}>
              Recent Activity
            </h3>
            <Link
              href="/audit-trail"
              style={{ fontSize: '0.75rem', color: 'var(--ds-teal-500)', textDecoration: 'none', fontWeight: 500 }}
            >
              View all
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {auditEvents.map((ev, i) => (
              <div key={ev.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
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
                    <GitCompareArrows size={16} />
                  ) : ev.action.includes('Finding') ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <FileCheck size={16} />
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
                      fontSize: '0.75rem',
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

      {/* Bottom KPI Metrics (From Image 1) */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>Reconciliation Accuracy</span>
            <CheckCircle size={18} color="var(--ds-teal-500)" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>94.2%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            +2.8% vs last week
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>Avg. Processing Time</span>
            <Clock size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>2.4 min</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            -36% vs last week
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>Documents / Hour</span>
            <Zap size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>48</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            +20% vs last week
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--ds-text-secondary)' }}>Active Vendors</span>
            <Users size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ds-text-primary)' }}>12</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ds-success)', marginTop: 4, fontWeight: 500 }}>
            +3 vs last week
          </div>
        </div>
      </div>

      {/* Quick Action Cards Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Link
          href="/documents/upload"
          className="card"
          style={{
            padding: 20,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--ds-border)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(13, 148, 136, 0.1)',
                color: 'var(--ds-teal-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Upload size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)', fontSize: '0.9rem' }}>
                Upload Business Documents
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                PDF, Contracts, POs, Invoices
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--ds-text-muted)" />
        </Link>

        <Link
          href="/reconciliation"
          className="card"
          style={{
            padding: 20,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--ds-border)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GitCompareArrows size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)', fontSize: '0.9rem' }}>
                Reconciliation Workspace
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                Compare values & find variances
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--ds-text-muted)" />
        </Link>

        <Link
          href="/review-queue"
          className="card"
          style={{
            padding: 20,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--ds-border)',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--ds-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClipboardCheck size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ds-text-primary)', fontSize: '0.9rem' }}>
                Review Queue
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>
                Human verification & decision logs
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--ds-text-muted)" />
        </Link>
      </div>
    </AppShell>
  );
}
