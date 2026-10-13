import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await ServerPersistence.getDocumentById(id);

    if (!doc) {
      return NextResponse.json(
        { success: false, error: `Document ${id} not found` },
        { status: 404 }
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await ServerPersistence.getDocumentById(id);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: `Document ${id} not found` },
        { status: 404 }
      );
    }

    await ServerPersistence.deleteDocument(id);

    await ServerPersistence.addAuditEvent({
      user_name: 'Gurumoorthy S',
      user_email: 'gurumoorthy@docusentinel.ai',
      action: 'Document Deleted',
      entity_type: 'document',
      entity_id: id,
      entity_title: doc.file_name,
      details: `Deleted document ${doc.file_name} from persistent workspace.`,
    });

    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
