import { NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function GET() {
  try {
    const stats = await ServerPersistence.getDashboardStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch dashboard statistics' },
      { status: 500 }
    );
  }
}
