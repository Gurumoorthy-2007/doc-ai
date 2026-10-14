import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Document, Finding, ReconciliationGroup } from '@/lib/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'reviewer' | 'user';
  organization_id?: string;
}

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && !url.includes('placeholder') && key && !key.includes('placeholder'));
}

/**
 * Returns true only when both DEMO_MODE is explicitly enabled AND we are
 * NOT running in a production environment.  This prevents the demo
 * fallback from ever activating in production, even if DEMO_MODE leaks
 * into the env.
 */
function isDemoModeAllowed(): boolean {
  const demoFlag = process.env.DEMO_MODE;
  const isProduction = process.env.NODE_ENV === 'production';
  return demoFlag === 'true' && !isProduction;
}

export const DEFAULT_DEMO_USER: AuthenticatedUser = {
  id: 'usr-demo-admin-001',
  email: 'demo@docusentinel.local',
  name: 'Demo User',
  role: 'admin',
};

/**
 * Server-side trusted authentication extractor.
 *
 * Authentication sources (in priority order):
 *   1. Supabase JWT — verified via Supabase Auth, role from `profiles` table.
 *   2. Demo fallback — returns a fixed demo admin user, but ONLY when
 *      `DEMO_MODE=true` AND `NODE_ENV !== 'production'`.
 *
 * Header-based and structured-token role claims have been removed.
 * Roles MUST come from a verified session or the database.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<{ user: AuthenticatedUser | null; error?: string; status?: number }> {
  const authHeader = req.headers.get('authorization');

  // ── 1. Supabase configured: verify JWT with Supabase auth ──────────
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

  // ── 2. Demo mode (non-production only) ─────────────────────────────
  if (isDemoModeAllowed()) {
    return { user: DEFAULT_DEMO_USER };
  }

  // ── 3. No valid auth source — reject ───────────────────────────────
  return {
    user: null,
    error: 'Unauthorized: No authentication provider configured. Set Supabase credentials or enable DEMO_MODE=true in a non-production environment.',
    status: 401,
  };
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
