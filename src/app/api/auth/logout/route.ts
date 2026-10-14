import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true, message: 'Logged out successfully' });

  // Clear session cookie
  res.cookies.set('ds-auth-token', '', {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
  });

  return res;
}
