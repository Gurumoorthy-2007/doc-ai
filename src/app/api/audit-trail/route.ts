import { NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function GET() {
  try {
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
