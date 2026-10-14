'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Shield,
  FileText,
  GitCompareArrows,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your work email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);

    if (authError) {
      setError(authError);
    } else {
      window.location.href = '/dashboard';
    }
  };

  const handleQuickDemoFill = () => {
    setEmail('demo@docusentinel.local');
    setPassword('demo-password-123');
    setError('');
  };

  return (
    <div className="auth-layout">
      {/* Left Dark Navy Panel (Exact Match to Approved Mockup Screen 1) */}
      <div className="auth-left">
        <div style={{ maxWidth: 440 }}>
          {/* Brand Logo & Subtitle */}
          <div className="auth-brand">
            <div className="auth-brand-logo">
              <Shield size={24} color="white" />
            </div>
            <div>
              <h1 className="auth-brand-title">DocuSentinel AI</h1>
              <p className="auth-brand-subtitle">
                Evidence-Backed Intelligence<br />for Business Documents
              </p>
            </div>
          </div>

          {/* 4 Feature Bullet Points */}
          <div className="auth-features-list">
            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <FileText size={18} />
              </div>
              <span className="auth-feature-text">
                Extracts information from multiple documents
              </span>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <GitCompareArrows size={18} />
              </div>
              <span className="auth-feature-text">
                Reconciles data across sources
              </span>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <AlertTriangle size={18} />
              </div>
              <span className="auth-feature-text">
                Detects anomalies and discrepancies
              </span>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <CheckCircle size={18} />
              </div>
              <span className="auth-feature-text">
                Provides evidence-backed findings
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right White Panel with Sign In Form */}
      <div className="auth-right">
        <div className="auth-form-container">
          {/* Quick Demo Pre-fill helper banner */}
          <div
            onClick={handleQuickDemoFill}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              background: 'rgba(13, 148, 136, 0.08)',
              border: '1px dashed #0d9488',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            title="Click to pre-fill demo admin credentials"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#0f766e', fontWeight: 500 }}>
              <Sparkles size={14} color="#0d9488" />
              <span>1-Click Demo Login: <strong>demo@docusentinel.local</strong></span>
            </div>
            <ArrowRight size={14} color="#0d9488" />
          </div>

          <h2 className="auth-heading">Welcome Back</h2>
          <p className="auth-subheading">
            Sign in to your account to continue
          </p>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid rgba(220, 38, 38, 0.2)',
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Work Email Address */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Work Email Address
              </label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember me</span>
              </label>

              <Link href="/auth/forgot-password" className="auth-link">
                Forgot Password?
              </Link>
            </div>

            {/* Sign In CTA Button */}
            <button
              type="submit"
              className="auth-btn-primary"
              disabled={loading}
              style={{ marginBottom: 24 }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Create Account Link */}
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.875rem',
              color: '#64748b',
              margin: 0,
            }}
          >
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="auth-link">
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
