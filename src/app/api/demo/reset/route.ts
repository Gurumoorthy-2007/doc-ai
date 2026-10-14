import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { authenticateRequest } from '@/lib/server/auth';

export async function POST(req: NextRequest) {
  try {
    // 1. Guard against production reset unless explicitly enabled
    const isProduction = process.env.NODE_ENV === 'production';
    const isResetAllowed = process.env.ENABLE_DEMO_RESET === 'true' || process.env.DEMO_MODE === 'true';

    if (isProduction && !isResetAllowed) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Demo reset is disabled in production environment.' },
        { status: 403 }
      );
    }

    // 2. Validate authentication: only authenticated users/admins can reset demo state
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    await ServerPersistence.resetData();

    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Demo Reset',
      entity_type: 'case',
      entity_id: 'sys-demo-reset',
      entity_title: 'Demo Workspace',
      details: `Demo state reset executed by ${auth.user.name} (${auth.user.email}).`,
    });

    return NextResponse.json({
      success: true,
      message: 'Demo workspace data reset successfully',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to reset demo data' },
      { status: 500 }
    );
  }
}
