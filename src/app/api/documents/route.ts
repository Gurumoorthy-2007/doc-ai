import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { validateAndInspectFile, saveFileToStorage, deleteFileFromStorage } from '@/lib/server/fileStorage';
import { extractDocumentWithEvidence } from '@/lib/ai/extraction';
import { authenticateRequest } from '@/lib/server/auth';
import type { Document, DocumentCategory } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const q = searchParams.get('q');

    // Filter by user ownership unless admin or reviewer
    const userIdFilter = auth.user.role === 'admin' || auth.user.role === 'reviewer' ? undefined : auth.user.id;
    let docs = await ServerPersistence.getDocuments(userIdFilter);

    if (category && category !== 'all') {
      docs = docs.filter((d) => d.category === category);
    }
    if (status && status !== 'all') {
      docs = docs.filter((d) => d.status === status);
    }
    if (q) {
      const lower = q.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.file_name.toLowerCase().includes(lower) ||
          d.category.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json({ success: true, data: docs });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let storedPath: string | null = null;
  let docCreated = false;
  let docId: string | null = null;

  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const categoryOverride = formData.get('category') as DocumentCategory | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided in upload payload' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Server-side validation of MIME, magic bytes, size, and page extraction
    const validated = await validateAndInspectFile(buffer, file.name, file.type);

    // 2. Infer or assign category
    const inferCategory = (name: string): DocumentCategory => {
      const lower = name.toLowerCase();
      if (lower.includes('inv') || lower.includes('bill')) return 'invoice';
      if (lower.includes('po') || lower.includes('order')) return 'purchase_order';
      if (lower.includes('contract') || lower.includes('agree') || lower.includes('msa') || lower.includes('sow')) return 'contract';
      if (lower.includes('receipt')) return 'receipt';
      if (lower.includes('statement')) return 'statement';
      if (lower.includes('complian') || lower.includes('iso')) return 'compliance';
      return 'invoice';
    };

    const category: DocumentCategory = categoryOverride || inferCategory(validated.fileName);

    // 3. Duplicate check by SHA-256 hash
    const existingDoc = await ServerPersistence.getDocumentByHash(validated.hash);
    if (existingDoc) {
      return NextResponse.json(
        {
          success: false,
          error: `Duplicate file detected: "${validated.fileName}" has identical content (SHA-256: ${validated.hash.substring(0, 12)}...) to existing document "${existingDoc.file_name}".`,
          isDuplicate: true,
          duplicateDocumentId: existingDoc.id,
        },
        { status: 409 }
      );
    }

    // 4. Save file securely to private storage
    storedPath = await saveFileToStorage(validated.buffer, validated.hash, validated.fileName);

    docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    // 5. Create persistent document record with 'processing' status
    const newDoc: Document = {
      id: docId,
      user_id: auth.user.id,
      file_name: validated.fileName,
      file_path: storedPath,
      file_size: validated.size,
      mime_type: validated.mimeType,
      category,
      classified_as: category,
      status: 'processing',
      page_count: validated.pageCount,
      processing_started_at: nowIso,
      processing_completed_at: null,
      processing_error: null,
      processing_attempts: 1,
      file_hash: validated.hash,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await ServerPersistence.createDocument(newDoc);
    docCreated = true;

    // 6. Run genuine AI / deterministic extraction
    try {
      const extraction = await extractDocumentWithEvidence(
        validated.buffer,
        validated.mimeType,
        category,
        validated.extractedText,
        docId,
        validated.pageTexts
      );

      // Save extracted fields and line items
      await ServerPersistence.saveExtractedFields(docId, extraction.fields);
      await ServerPersistence.saveLineItems(docId, extraction.lineItems);

      // Update document to completed
      const completedDoc = await ServerPersistence.updateDocument(docId, {
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
      });

      // Audit event with verified user identity
      await ServerPersistence.addAuditEvent({
        user_name: auth.user.name,
        user_email: auth.user.email,
        action: 'Document Uploaded & Processed',
        entity_type: 'document',
        entity_id: docId,
        entity_title: validated.fileName,
        details: `Successfully uploaded and extracted ${extraction.fields.length} structured fields (${extraction.modelUsed}) with ${(validated.size / (1024 * 1024)).toFixed(2)} MB content.`,
      });

      return NextResponse.json({
        success: true,
        data: {
          document: completedDoc,
          extraction: extraction.result,
          fields: extraction.fields,
          lineItems: extraction.lineItems,
        },
      });
    } catch (procErr: unknown) {
      const errMsg = (procErr as Error).message || 'Extraction failed';
      await ServerPersistence.updateDocument(docId, {
        status: 'error',
        processing_error: errMsg,
      });

      return NextResponse.json(
        {
          success: false,
          error: `Document saved but processing failed: ${errMsg}`,
          documentId: docId,
        },
        { status: 500 }
      );
    }
  } catch (err: unknown) {
    // If saving file succeeded but document creation failed completely, clean up orphan file
    if (storedPath && !docCreated) {
      await deleteFileFromStorage(storedPath).catch(() => {});
    }

    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Upload failed' },
      { status: 400 }
    );
  }
}
