import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'docusentinel-enterprise-session-secret-key-2026';

export interface SessionPayload {
  id: string;
  email: string;
  role: 'admin' | 'reviewer' | 'user';
  name: string;
  exp: number;
}

export function createSessionToken(user: {
  id?: string;
  email: string;
  role?: 'admin' | 'reviewer' | 'user';
  name?: string;
}): string {
  const payload: SessionPayload = {
    id: user.id || `usr-${Date.now()}`,
    email: user.email.trim(),
    role: user.role || 'admin',
    name: user.name || user.email.split('@')[0].replace('.', ' ').replace(/^./, (c) => c.toUpperCase()),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');

  if (signature !== expectedSignature) return null;

  try {
    const raw = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(raw) as SessionPayload;
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
