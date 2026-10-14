import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { deleteFileFromStorage } from '@/lib/server/fileStorage';
import { authenticateRequest, checkDocumentOwnership } from '@/lib/server/auth';

export async function GET(
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
    const doc = await ServerPersistence.getDocumentById(id);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: `Document ${id} not found` },
        { status: 404 }
      );
    }

    // Verify ownership
    if (!checkDocumentOwnership(auth.user, doc)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to access this document' },
        { status: 403 }
      );
    }

    const fields = await ServerPersistence.getExtractedFields(id);
    const lineItems = await ServerPersistence.getLineItems(id);
    const findings = (await ServerPersistence.getFindings()).filter(
      (f) => f.source_document_id === id || f.compared_document_id === id
    );

    return NextResponse.json({
      success: true,
      data: {
        document: doc,
        fields,
        lineItems,
        findings,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const doc = await ServerPersistence.getDocumentById(id);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: `Document ${id} not found` },
        { status: 404 }
      );
    }

    // Verify ownership
    if (!checkDocumentOwnership(auth.user, doc)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to delete this document' },
        { status: 403 }
      );
    }

    // Delete document from persistence layer
    await ServerPersistence.deleteDocument(id);

    // Clean up physical file storage if no other document shares this file
    if (doc.file_path) {
      const allDocs = await ServerPersistence.getDocuments();
      const isShared = allDocs.some((d) => d.id !== id && d.file_path === doc.file_path);
      if (!isShared) {
        await deleteFileFromStorage(doc.file_path).catch(() => {});
      }
    }

    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Document Deleted',
      entity_type: 'document',
      entity_id: id,
      entity_title: doc.file_name,
      details: `Deleted document ${doc.file_name} and cleaned up associated extracted records and storage.`,
    });

    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
