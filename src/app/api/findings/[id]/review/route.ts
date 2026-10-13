import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { decision, comments, reviewerName } = body;

    if (!decision || !['accepted', 'rejected', 'reviewing'].includes(decision)) {
      return NextResponse.json(
        { success: false, error: 'Invalid review decision. Must be "accepted", "rejected", or "reviewing".' },
        { status: 400 }
      );
    }

    const updated = await ServerPersistence.updateFindingReview(
      id,
      decision,
      comments || '',
      reviewerName || 'Gurumoorthy S'
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Finding ${id} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Review recorded: ${decision.toUpperCase()}`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to save review decision' },
      { status: 500 }
    );
  }
}
