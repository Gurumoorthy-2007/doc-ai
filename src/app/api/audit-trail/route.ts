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

    const auditEvents = await ServerPersistence.getAuditEvents();
    const caseHistory = await ServerPersistence.getCaseHistory();

    return NextResponse.json({
      success: true,
      data: {
        auditEvents,
        caseHistory,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch audit trail' },
      { status: 500 }
    );
  }
}
