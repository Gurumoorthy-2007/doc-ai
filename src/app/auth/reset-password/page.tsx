'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await updatePassword(password);
    setLoading(false);

    if (resetError) {
      setError(resetError);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="auth-layout">
      {/* Left Panel */}
      <div className="auth-left">
        <div style={{ maxWidth: 440 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <div
              className="logo-icon"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Shield size={22} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>DocuSentinel AI</h1>
              <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
                Evidence-Based Intelligence<br />for Business Documents
              </p>
            </div>
          </div>

          <div style={{ color: 'white', opacity: 0.9 }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 12 }}>
              Secure Password Reset
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
              Set a new, strong password to regain access to your document intelligence dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="auth-right">
        <div className="auth-form-container">
          {!success ? (
            <>
              <h2 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Set New Password</h2>
              <p style={{ color: 'var(--ds-text-secondary)', marginBottom: 32, fontSize: '0.9rem' }}>
                Please choose a secure password with at least 8 characters.
              </p>

              {error && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--ds-radius)',
                    background: 'var(--ds-error-bg)',
                    color: 'var(--ds-error)',
                    fontSize: '0.875rem',
                    marginBottom: 20,
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label" htmlFor="password">
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
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
                        color: 'var(--ds-text-muted)',
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="confirmPassword">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 8 }}
                  disabled={loading}
                >
                  <Lock size={16} />
                  {loading ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>

              <div style={{ textAlign: 'center', marginTop: 24 }}>
                <Link
                  href="/auth/login"
                  style={{
                    color: 'var(--ds-teal-500)',
                    fontSize: '0.875rem',
                    textDecoration: 'none',
                    fontWeight: 500,
                  }}
                >
                  ← Back to Login
                </Link>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'var(--ds-success-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  color: 'var(--ds-success)',
                }}
              >
                <CheckCircle size={36} />
              </div>

              <h2 style={{ fontSize: '1.5rem', marginBottom: 8 }}>Password Updated!</h2>
              <p
                style={{
                  color: 'var(--ds-text-secondary)',
                  marginBottom: 32,
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                }}
              >
                Your password has been successfully reset. You can now sign in with your new credentials.
              </p>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => router.push('/auth/login')}
              >
                Continue to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
