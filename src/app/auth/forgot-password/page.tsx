'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Mail, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }

    setLoading(true);
    const { error: err } = await resetPassword(email);
    setLoading(false);

    if (err) {
      setError(err);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-left">
        <div style={{ maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #14b8a6, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={22} color="white" />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>DocuSentinel AI</h1>
          </div>
          <h2 style={{ color: 'white', fontSize: '1.5rem', marginBottom: 8 }}>We&apos;ll help you get back in</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container" style={{ textAlign: 'center' }}>
          {!sent ? (
            <>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#3b82f6' }}>
                <Mail size={24} />
              </div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Reset Your Password</h2>
              <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 28, fontSize: '0.9rem' }}>
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              {error && (
                <div style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error)', padding: '10px 14px', borderRadius: 'var(--ds-radius)', marginBottom: 18, fontSize: '0.85rem', textAlign: 'left' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group" style={{ textAlign: 'left' }}>
                  <label className="form-label" htmlFor="reset-email">Work Email Address</label>
                  <input id="reset-email" type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
              <Link href="/auth/login" style={{ color: 'var(--ds-text-secondary)', fontSize: '0.85rem', textDecoration: 'none' }}>
                Back to Login
              </Link>
            </>
          ) : (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ds-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--ds-success)' }}>
                <CheckCircle size={28} />
              </div>
              <h2 style={{ marginBottom: 8 }}>Check Your Email</h2>
              <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 8, fontSize: '0.9rem' }}>
                We&apos;ve sent a password reset link to
              </p>
              <p style={{ fontWeight: 600, marginBottom: 24 }}>{email}</p>
              <p style={{ color: 'var(--ds-text-muted)', fontSize: '0.85rem', marginBottom: 32 }}>
                If you don&apos;t see it, check your spam folder.
              </p>
              <Link href="/auth/login" className="btn btn-primary" style={{ textDecoration: 'none', marginBottom: 12, display: 'inline-flex' }}>
                Back to Login
              </Link>
              <br />
              <button onClick={() => { setSent(false); setEmail(''); }} className="btn btn-ghost" style={{ marginTop: 8 }}>
                Resend Email
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
