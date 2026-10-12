'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Eye, EyeOff } from 'lucide-react';

export default function SignupPage() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!agreeTerms) { setError('Please agree to the Terms of Service.'); return; }

    setLoading(true);
    const { error: authError } = await signUp(email, password, fullName);
    setLoading(false);

    if (authError) {
      setError(authError);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
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
            <h2 style={{ color: 'white', fontSize: '1.5rem', marginBottom: 8 }}>Smarter Document Analysis for Better Decisions</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              Compare contracts, POs, invoices and compliance documents. Get evidence-backed insights.
            </p>
          </div>
        </div>
        <div className="auth-right">
          <div className="auth-form-container" style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ds-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--ds-success)' }}>
              <Shield size={28} />
            </div>
            <h2 style={{ marginBottom: 8 }}>Check Your Email</h2>
            <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 24, fontSize: '0.9rem' }}>
              We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
            </p>
            <Link href="/auth/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          <h2 style={{ color: 'white', fontSize: '1.5rem', marginBottom: 8 }}>Smarter Document Analysis for Better Decisions</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
            Compare contracts, POs, invoices and compliance documents. Get evidence-backed insights.
          </p>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-form-container">
          <div className="auth-logo">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg, #14b8a6, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={18} color="white" />
            </div>
            <h1 style={{ fontSize: '1.1rem' }}>DocuSentinel AI</h1>
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Create Your Account</h2>
          <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 28, fontSize: '0.9rem' }}>
            Join DocuSentinel AI and get started
          </p>

          {error && (
            <div style={{ background: 'var(--ds-error-bg)', color: 'var(--ds-error)', padding: '10px 14px', borderRadius: 'var(--ds-radius)', marginBottom: 18, fontSize: '0.85rem', fontWeight: 500 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-name">Full Name</label>
              <input id="signup-name" type="text" className="form-input" placeholder="Enter your full name" value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-email">Work Email Address</label>
              <input id="signup-email" type="email" className="form-input" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Create a password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{ paddingRight: 42 }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-text-muted)' }}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="form-help">Enter your password (must meet your rules)</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-confirm">Confirm Password</label>
              <input id="signup-confirm" type="password" className="form-input" placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ accentColor: 'var(--ds-teal-500)', marginTop: 3 }} />
                <span>I agree to the <a href="#" style={{ color: 'var(--ds-teal-500)' }}>Terms of Service</a> and <a href="#" style={{ color: 'var(--ds-teal-500)' }}>Privacy Policy</a></span>
              </label>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginBottom: 24 }}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--ds-text-secondary)' }}>
            Already have an account?{' '}
            <Link href="/auth/login" style={{ color: 'var(--ds-teal-500)', fontWeight: 500, textDecoration: 'none' }}>Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
