import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { getFileFromStorage, validateAndInspectFile } from '@/lib/server/fileStorage';


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const asText = searchParams.get('text') === 'true';

    const doc = await ServerPersistence.getDocumentById(id);
    if (!doc) {
      return NextResponse.json(
        { success: false, error: `Document ${id} not found` },
        { status: 404 }
      );
    }

    const buffer = await getFileFromStorage(doc.file_path);

    if (!buffer) {
      // Fallback: If original binary not found on disk, return structured metadata
      return NextResponse.json(
        {
          success: false,
          error: `Original file not found on disk for document ${id}.`,
          document: doc,
        },
        { status: 404 }
      );
    }

    if (asText) {
      let text = '';
      try {
        const inspected = await validateAndInspectFile(buffer, doc.file_name);
        text = inspected.extractedText;
      } catch {
        text = buffer.toString('utf-8');
      }
      return NextResponse.json({
        success: true,
        data: {
          id: doc.id,
          fileName: doc.file_name,
          mimeType: doc.mime_type,
          pageCount: doc.page_count,
          text,
        },
      });
    }

    // Return the actual file binary
    const headers = new Headers();
    headers.set('Content-Type', doc.mime_type || 'application/pdf');
    headers.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.file_name)}"`
    );
    headers.set('X-Content-Type-Options', 'nosniff');

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to retrieve document file' },
      { status: 500 }
    );
  }
}
