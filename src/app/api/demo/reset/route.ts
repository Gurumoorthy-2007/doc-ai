import { NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function POST() {
  try {
    await ServerPersistence.resetData();
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
