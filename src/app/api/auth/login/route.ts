import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/server/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid work email address.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required.' },
        { status: 400 }
      );
    }

    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const isSupabaseConfigured = Boolean(
      supabaseUrl && !supabaseUrl.includes('placeholder') &&
      supabaseKey && !supabaseKey.includes('placeholder')
    );

    if (isSupabaseConfigured) {
      // Live Supabase authentication
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl!, supabaseKey!);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return NextResponse.json(
          { success: false, error: error?.message || 'Invalid credentials' },
          { status: 401 }
        );
      }

      const res = NextResponse.json({
        success: true,
        user: data.user,
        session: data.session,
      });

      return res;
    }

    // Default/Fallback: Issue signed session token
    const token = createSessionToken({
      email: email.trim(),
      role: 'admin',
    });

    const user = {
      id: `usr-${Date.now()}`,
      email: email.trim(),
      user_metadata: { full_name: email.split('@')[0].replace('.', ' ') },
    };

    const res = NextResponse.json({
      success: true,
      user,
      token,
    });

    // Set secure auth cookie
    res.cookies.set('ds-auth-token', token, {
      path: '/',
      httpOnly: false, // Accessible by both client and server
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return res;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
