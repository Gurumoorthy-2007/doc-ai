import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { deleteFileFromStorage } from '@/lib/server/fileStorage';
import { authenticateRequest, checkDocumentOwnership } from '@/lib/server/auth';
import type { ExtractedField, LineItem } from '@/lib/types';

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

export async function PATCH(
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
        { success: false, error: 'Forbidden: You do not have permission to modify this document' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fields, lineItems } = body;

    if (Array.isArray(fields)) {
      const formattedFields: ExtractedField[] = fields.map((f: Partial<ExtractedField>, idx: number) => ({
        id: f.id || `field-${id}-${idx + 1}-${Date.now()}`,
        document_id: id,
        field_name: String(f.field_name || '').trim().toLowerCase().replace(/\s+/g, '_'),
        field_value: f.field_value !== null && f.field_value !== undefined ? String(f.field_value).trim() : null,
        field_type: String(f.field_type || 'string').trim(),
        confidence: typeof f.confidence === 'number' ? Math.max(0, Math.min(1, f.confidence)) : 1.0,
        is_missing: Boolean(f.is_missing || !f.field_value),
        is_ambiguous: Boolean(f.is_ambiguous),
        source_text: f.source_text ? String(f.source_text).trim() : 'Manual user entry / edited table',
        source_page: typeof f.source_page === 'number' ? f.source_page : (parseInt(String(f.source_page), 10) || 1),
        created_at: f.created_at || new Date().toISOString(),
      }));
      await ServerPersistence.saveExtractedFields(id, formattedFields);
    }

    if (Array.isArray(lineItems)) {
      const formattedItems: LineItem[] = lineItems.map((li: Partial<LineItem>, idx: number) => {
        const qty = typeof li.quantity === 'number' ? li.quantity : (parseFloat(String(li.quantity)) || null);
        const unitPrice = typeof li.unit_price === 'number' ? li.unit_price : (parseFloat(String(li.unit_price)) || null);
        let amount = typeof li.amount === 'number' ? li.amount : (parseFloat(String(li.amount)) || null);

        if (amount === null && qty !== null && unitPrice !== null) {
          amount = Math.round(qty * unitPrice * 100) / 100;
        }

        return {
          id: li.id || `li-${id}-${idx + 1}-${Date.now()}`,
          document_id: id,
          item_number: typeof li.item_number === 'number' ? li.item_number : (idx + 1),
          description: li.description ? String(li.description).trim() : null,
          quantity: qty,
          unit_price: unitPrice,
          amount: amount,
          unit: li.unit ? String(li.unit).trim() : 'unit',
          source_page: typeof li.source_page === 'number' ? li.source_page : (parseInt(String(li.source_page), 10) || 1),
          created_at: li.created_at || new Date().toISOString(),
        };
      });
      await ServerPersistence.saveLineItems(id, formattedItems);
    }

    // Add audit event
    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Document Data Edited',
      entity_type: 'document',
      entity_id: id,
      entity_title: doc.file_name,
      details: `Updated extracted table data: ${Array.isArray(fields) ? fields.length : 'preserved'} fields, ${Array.isArray(lineItems) ? lineItems.length : 'preserved'} line items.`,
    });

    const updatedFields = await ServerPersistence.getExtractedFields(id);
    const updatedLineItems = await ServerPersistence.getLineItems(id);

    return NextResponse.json({
      success: true,
      message: 'Document data table updated successfully',
      data: {
        fields: updatedFields,
        lineItems: updatedLineItems,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to update document data' },
      { status: 500 }
    );
  }
}

