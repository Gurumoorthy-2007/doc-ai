import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy (replaces middleware.ts).
 *
 * Runs before every matched route. Protects:
 *   - /api/* routes (except auth, health, and demo/reset)
 *   - App pages (except /auth/*)
 *
 * In Supabase mode, checks for a Supabase auth cookie.
 * In demo mode (DEMO_MODE=true, non-production), allows all requests.
 *
 * NOTE: This is a first line of defense. Every API route handler MUST
 * still call authenticateRequest() for authoritative auth — proxy
 * cannot share module state with route handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip: public assets, static files, Next internals ──────────────
  // These are excluded by the matcher below, but guard defensively.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }

  // ── Skip: auth routes (login, signup, callback, reset) ─────────────
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // ── Skip: health check and demo reset ──────────────────────────────
  if (pathname === '/api/health' || pathname === '/api/demo/reset') {
    return NextResponse.next();
  }

  // ── Demo mode bypass ───────────────────────────────────────────────
  const isDemoMode =
    process.env.DEMO_MODE === 'true' &&
    process.env.NODE_ENV !== 'production';

  if (isDemoMode) {
    return NextResponse.next();
  }

  // ── Check for authentication evidence ──────────────────────────────
  // In the proxy layer we can only do a lightweight check (cookie/header
  // presence). Full JWT verification happens in the route handler via
  // authenticateRequest().

  const hasAuthHeader = request.headers.has('authorization');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasSupabaseCookie = /sb-[a-zA-Z0-9]+-auth-token/.test(cookieHeader);
  const hasSessionCookie = /ds-auth-token=[^;]+/.test(cookieHeader);

  const isAuthenticated = hasAuthHeader || hasSupabaseCookie || hasSessionCookie;

  if (!isAuthenticated) {
    // API routes → 401 JSON response
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required' },
        { status: 401 }
      );
    }

    // App pages → redirect to login
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     * - public folder assets (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$).*)',
  ],
};
