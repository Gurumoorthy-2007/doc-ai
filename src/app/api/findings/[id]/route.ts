import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const finding = await ServerPersistence.getFindingById(id);

    if (!finding) {
      return NextResponse.json(
        { success: false, error: `Finding ${id} not found` },
        { status: 404 }
      );
    }

    let sourceDoc = null;
    let comparedDoc = null;
    let sourceFields: any[] = [];

    if (finding.source_document_id) {
      sourceDoc = await ServerPersistence.getDocumentById(finding.source_document_id);
      sourceFields = await ServerPersistence.getExtractedFields(finding.source_document_id);
    }
    if (finding.compared_document_id) {
      comparedDoc = await ServerPersistence.getDocumentById(finding.compared_document_id);
    }

    return NextResponse.json({
      success: true,
      data: {
        finding,
        sourceDocument: sourceDoc,
        comparedDocument: comparedDoc,
        sourceFields,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch finding' },
      { status: 500 }
    );
  }
}
