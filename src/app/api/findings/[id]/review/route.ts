import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { authenticateRequest, checkFindingOwnership } from '@/lib/server/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { id } = await params;
    const finding = await ServerPersistence.getFindingById(id);
    if (!finding) {
      return NextResponse.json(
        { success: false, error: `Finding ${id} not found` },
        { status: 404 }
      );
    }

    // Check authorization: verify user is authorized to review this finding
    if (!checkFindingOwnership(auth.user, finding)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to review this finding.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let decision = body.decision;
    const comments = typeof body.comments === 'string' ? body.comments.trim() : '';

    if (decision === 'in_review') {
      decision = 'reviewing';
    }

    const validDecisions = ['accepted', 'rejected', 'reviewing', 'resolved'];
    if (!decision || !validDecisions.includes(decision)) {
      return NextResponse.json(
        { success: false, error: `Invalid review decision "${decision}". Must be one of: ${validDecisions.join(', ')}.` },
        { status: 400 }
      );
    }

    // Never trust reviewer name from client payload: derive from trusted server session!
    const verifiedReviewerName = auth.user.name;

    const updated = await ServerPersistence.updateFindingReview(
      id,
      decision,
      comments,
      verifiedReviewerName
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
