import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { authenticateRequest } from '@/lib/server/auth';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity');
    const status = searchParams.get('status');
    const q = searchParams.get('q');

    const userIdFilter = auth.user.role === 'admin' || auth.user.role === 'reviewer' ? undefined : auth.user.id;
    let findings = await ServerPersistence.getFindings(userIdFilter);

    if (severity && severity !== 'all') {
      if (severity === 'high') {
        findings = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
      } else if (severity === 'low') {
        findings = findings.filter((f) => f.severity === 'low' || f.severity === 'info');
      } else {
        findings = findings.filter((f) => f.severity === severity);
      }
    }

    if (status && status !== 'all') {
      findings = findings.filter((f) => f.status === status);
    }

    if (q) {
      const lower = q.toLowerCase();
      findings = findings.filter(
        (f) =>
          f.title.toLowerCase().includes(lower) ||
          f.id.toLowerCase().includes(lower) ||
          (f.reason && f.reason.toLowerCase().includes(lower))
      );
    }

    return NextResponse.json({ success: true, data: findings });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch findings' },
      { status: 500 }
    );
  }
}
