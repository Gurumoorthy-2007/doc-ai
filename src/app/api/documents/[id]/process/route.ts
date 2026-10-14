import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { getFileFromStorage, validateAndInspectFile } from '@/lib/server/fileStorage';
import { extractDocumentWithEvidence } from '@/lib/ai/extraction';
import { authenticateRequest, checkDocumentOwnership } from '@/lib/server/auth';

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
        { success: false, error: 'Forbidden: You do not have permission to process this document' },
        { status: 403 }
      );
    }

    // Prevent concurrent duplicate processing
    if (doc.status === 'processing') {
      return NextResponse.json(
        { success: false, error: 'Document is currently being processed. Please wait for the current run to complete.' },
        { status: 409 }
      );
    }

    // Set to processing
    await ServerPersistence.updateDocument(id, {
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      processing_error: null,
    });

    const fileBuffer = await getFileFromStorage(doc.file_path);
    let extractedText = '';
    let pageTexts: string[] = [];

    if (fileBuffer) {
      try {
        const inspected = await validateAndInspectFile(fileBuffer, doc.file_name);
        extractedText = inspected.extractedText;
        pageTexts = inspected.pageTexts;
      } catch (inspectErr) {
        console.warn('Re-inspection warning:', inspectErr);
      }
    }

    const extraction = await extractDocumentWithEvidence(
      fileBuffer || Buffer.from(''),
      doc.mime_type,
      doc.category,
      extractedText,
      doc.id,
      pageTexts
    );

    await ServerPersistence.saveExtractedFields(doc.id, extraction.fields);
    await ServerPersistence.saveLineItems(doc.id, extraction.lineItems);

    const updatedDoc = await ServerPersistence.updateDocument(doc.id, {
      status: 'completed',
      processing_completed_at: new Date().toISOString(),
      processing_attempts: (doc.processing_attempts || 0) + 1,
    });

    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Document Re-processed',
      entity_type: 'document',
      entity_id: doc.id,
      entity_title: doc.file_name,
      details: `Re-ran extraction (${extraction.modelUsed}): extracted ${extraction.fields.length} fields.`,
    });

    return NextResponse.json({
      success: true,
      data: {
        document: updatedDoc,
        fields: extraction.fields,
        lineItems: extraction.lineItems,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Re-processing failed' },
      { status: 500 }
    );
  }
}
