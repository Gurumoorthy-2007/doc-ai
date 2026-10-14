import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Document, Finding, ReconciliationGroup } from '@/lib/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'reviewer' | 'user';
}

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && !url.includes('placeholder') && key && !key.includes('placeholder'));
}

export const DEFAULT_DEMO_USER: AuthenticatedUser = {
  id: 'usr-demo-admin-001',
  email: 'gurumoorthy@docusentinel.ai',
  name: 'Gurumoorthy S',
  role: 'admin',
};

/**
 * Server-side trusted authentication extractor.
 * Validates session from Authorization header (Bearer token) or Supabase auth session.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<{ user: AuthenticatedUser | null; error?: string; status?: number }> {
  const authHeader = req.headers.get('authorization');

  // 1. Supabase configured: verify JWT with Supabase auth
  if (isSupabaseConfigured()) {
    const supabase = createServerSupabase();
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      // Check cookies for sb-access-token
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(/sb-[a-zA-Z0-9]+-auth-token=([^;]+)/);
      if (match) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || null;
        } catch {
          token = null;
        }
      }
    }

    if (!token) {
      return { user: null, error: 'Unauthorized: Authentication required', status: 401 };
    }

    try {
      const { data: { user: sbUser }, error } = await supabase.auth.getUser(token);
      if (error || !sbUser) {
        return { user: null, error: 'Unauthorized: Invalid or expired session token', status: 401 };
      }

      // Fetch user profile from database for trusted role
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sbUser.id)
        .single();

      return {
        user: {
          id: sbUser.id,
          email: sbUser.email || '',
          name: profile?.full_name || sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || 'User',
          role: (profile?.role as 'admin' | 'reviewer' | 'user') || 'user',
        },
      };
    } catch {
      return { user: null, error: 'Unauthorized: Session verification failed', status: 401 };
    }
  }

  // 2. Local / Demo mode session handling
  // If explicitly unauthenticated header is sent or requested
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Support structured demo tokens: "id:email:name:role"
    if (token.includes(':')) {
      const parts = token.split(':');
      const [id, email, name, role] = parts;
      const validRole = (role === 'admin' || role === 'reviewer' || role === 'user') ? role : 'user';
      return {
        user: {
          id: id || 'usr-custom',
          email: email || `${id}@docusentinel.ai`,
          name: name ? decodeURIComponent(name) : 'User',
          role: validRole,
        },
      };
    }

    if (token === 'unauthenticated' || token === 'invalid') {
      return { user: null, error: 'Unauthorized: Invalid authentication credentials', status: 401 };
    }

    if (token && token !== 'demo') {
      return {
        user: {
          id: token,
          email: `${token}@docusentinel.ai`,
          name: token.replace(/^usr-/, '').replace(/[-_]/g, ' '),
          role: token.includes('admin') ? 'admin' : token.includes('reviewer') ? 'reviewer' : 'user',
        },
      };
    }
  }

  // Check custom user headers for browser demo state
  const customUserId = req.headers.get('x-user-id');
  if (customUserId) {
    const customEmail = req.headers.get('x-user-email') || `${customUserId}@docusentinel.ai`;
    const customName = req.headers.get('x-user-name') || 'User';
    const customRole = (req.headers.get('x-user-role') as 'admin' | 'reviewer' | 'user') || 'user';
    return {
      user: {
        id: customUserId,
        email: customEmail,
        name: customName,
        role: customRole,
      },
    };
  }

  // Default to demo admin in development/demo mode when no conflicting headers exist
  return { user: DEFAULT_DEMO_USER };
}

/**
 * Enforce document ownership:
 * - Admins and reviewers can access all documents
 * - Standard users can only access documents where document.user_id === user.id
 */
export function checkDocumentOwnership(user: AuthenticatedUser, doc: Document): boolean {
  if (user.role === 'admin' || user.role === 'reviewer') return true;
  return doc.user_id === user.id;
}

/**
 * Enforce finding ownership:
 * - Admins and reviewers can access and review all findings
 * - Standard users can only access findings where finding.user_id === user.id
 */
export function checkFindingOwnership(user: AuthenticatedUser, finding: Finding): boolean {
  if (user.role === 'admin' || user.role === 'reviewer') return true;
  return finding.user_id === user.id;
}

/**
 * Enforce reconciliation group access:
 * - Admins and reviewers can access all groups
 * - Standard users can only access groups where group.user_id === user.id
 */
export function checkReconciliationOwnership(user: AuthenticatedUser, group: ReconciliationGroup): boolean {
  if (user.role === 'admin' || user.role === 'reviewer') return true;
  return group.user_id === user.id;
}
