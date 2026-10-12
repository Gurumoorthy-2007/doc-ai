'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/auth/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ds-navy-950)',
        color: 'white',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(13, 148, 136, 0.4)',
          }}
        >
          <Shield size={32} color="white" />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>
          DocuSentinel AI
        </h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.875rem' }}>
          Loading document intelligence platform...
        </p>
      </div>
    </div>
  );
}
