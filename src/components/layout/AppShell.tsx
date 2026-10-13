'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { DataStore } from '@/lib/data/store';
import {
  LayoutDashboard,
  FileText,
  GitCompareArrows,
  AlertTriangle,
  ClipboardCheck,
  History,
  Shield,
  Search,
  Bell,
  Calendar,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFindingsCount, setOpenFindingsCount] = useState(0);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentDate, setCurrentDate] = useState('Apr 26, 2025');

  useEffect(() => {
    setCurrentDate(format(new Date(), 'MMM d, yyyy'));
    // Read live badges
    const findings = DataStore.getFindings();
    const openCount = findings.filter((f) => f.status === 'open').length;
    const reviewCount = findings.filter((f) => !f.is_reviewed && f.status !== 'resolved').length;
    setOpenFindingsCount(openCount);
    setPendingReviewCount(reviewCount);

    DataStore.fetchFindings()
      .then((serverFindings) => {
        if (serverFindings) {
          setOpenFindingsCount(serverFindings.filter((f) => f.status === 'open').length);
          setPendingReviewCount(serverFindings.filter((f) => !f.is_reviewed && f.status !== 'resolved').length);
        }
      })
      .catch(() => {});
  }, [pathname]);

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'GS';

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/documents', label: 'Documents', icon: FileText },
    { href: '/reconciliation', label: 'Reconciliation', icon: GitCompareArrows },
    { href: '/findings', label: 'Findings', icon: AlertTriangle, badge: openFindingsCount },
    { href: '/review-queue', label: 'Review Queue', icon: ClipboardCheck, badge: pendingReviewCount },
    { href: '/audit-trail', label: 'Audit Trail', icon: History },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/documents?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 45,
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Link href="/dashboard" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="logo-icon">
                <Shield size={18} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'white', lineHeight: 1.2 }}>
                  DocuSentinel AI
                </h1>
                <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.2 }}>
                  Evidence-Backed Intelligence<br />for Business Documents
                </p>
              </div>
            </Link>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="icon-btn mobile-only"
              style={{ color: 'white' }}
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="badge">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user" onClick={() => setShowUserMenu(!showUserMenu)} style={{ cursor: 'pointer' }}>
          <div className="avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{profile?.full_name || 'Gurumoorthy S'}</div>
            <div className="user-role">{profile?.role ? profile.role.toUpperCase() : 'Admin'}</div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              signOut();
            }}
            title="Sign Out"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              marginLeft: 'auto',
              padding: 4,
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 520 }}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="icon-btn mobile-only"
              aria-label="Open sidebar"
              style={{ display: 'none' }}
            >
              <Menu size={20} />
            </button>

            <form onSubmit={handleSearchSubmit} className="search-bar" style={{ width: '100%' }}>
              <Search size={16} style={{ color: 'var(--ds-text-muted)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search documents, invoices, vendors..."
                id="global-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          </div>

          <div className="header-right">
            <div className="header-date">
              <Calendar size={14} />
              {currentDate}
            </div>

            <button
              className="icon-btn"
              aria-label="Notifications"
              onClick={() => router.push('/findings')}
              title={`${openFindingsCount} open findings`}
            >
              <Bell size={18} />
              {openFindingsCount > 0 && <span className="notification-dot"></span>}
            </button>

            <button
              className="icon-btn"
              aria-label="Settings"
              onClick={() => router.push('/audit-trail')}
              title="Audit Log & Settings"
            >
              <Settings size={18} />
            </button>

            <div style={{ position: 'relative' }}>
              <button
                className="header-avatar"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="User menu"
              >
                {initials}
              </button>
              {showUserMenu && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 8,
                    background: 'var(--ds-surface)',
                    border: '1px solid var(--ds-border)',
                    borderRadius: 'var(--ds-radius)',
                    boxShadow: 'var(--ds-shadow-lg)',
                    padding: '8px',
                    minWidth: 200,
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--ds-border)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{profile?.full_name || 'Gurumoorthy S'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ds-text-muted)' }}>{profile?.email || 'gurumoorthy@docusentinel.ai'}</div>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <button
                      className="sidebar-link"
                      onClick={() => {
                        DataStore.resetDemoData();
                        setShowUserMenu(false);
                        window.location.reload();
                      }}
                      style={{ color: 'var(--ds-teal-500)', width: '100%', padding: '8px 12px' }}
                    >
                      <History size={16} />
                      <span>Reset Demo Data</span>
                    </button>
                    <button
                      className="sidebar-link"
                      onClick={() => {
                        signOut();
                        setShowUserMenu(false);
                      }}
                      style={{ color: 'var(--ds-error)', width: '100%', padding: '8px 12px' }}
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="page-content">{children}</div>
      </main>
    </>
  );
}
