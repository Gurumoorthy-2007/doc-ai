import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { getFileFromStorage, validateAndInspectFile } from '@/lib/server/fileStorage';
import { isNvidiaConfigured, summarizeDocumentWithNvidia } from '@/lib/ai/nvidia';
import { authenticateRequest } from '@/lib/server/auth';
import { getGlobalRateLimiter, AI_ROUTE_LIMIT } from '@/lib/server/rateLimit';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    // ── Rate limit ───────────────────────────────────────────────────
    const rl = await getGlobalRateLimiter().check(
      `summarize:${auth.user.id}`,
      AI_ROUTE_LIMIT.limit,
      AI_ROUTE_LIMIT.windowMs
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait before requesting another summary.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
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

    let documentText = '';
    const fileBuffer = await getFileFromStorage(doc.file_path);
    if (fileBuffer) {
      try {
        const inspected = await validateAndInspectFile(fileBuffer, doc.file_name);
        documentText = inspected.extractedText;
      } catch (inspectErr) {
        console.warn('Text extraction for summarization warning:', inspectErr);
      }
    }

    // If file text couldn't be extracted from storage, reconstruct from saved fields
    if (!documentText.trim()) {
      const savedFields = await ServerPersistence.getExtractedFields(id);
      documentText = savedFields
        .map((f) => `${f.field_name}: ${f.field_value || 'N/A'}${f.source_text ? ` (Source: "${f.source_text}")` : ''}`)
        .join('\n');
    }

    if (!documentText.trim()) {
      return NextResponse.json(
        { success: false, error: 'No text or extracted fields available to summarize for this document.' },
        { status: 400 }
      );
    }

    let summaryData;
    if (isNvidiaConfigured()) {
      summaryData = await summarizeDocumentWithNvidia(documentText, {
        fileName: doc.file_name,
        category: doc.category,
      });
    } else {
      // Deterministic structured summary fallback when NVIDIA API key is not supplied
      const fields = await ServerPersistence.getExtractedFields(id);
      const supplierField = fields.find((f) => f.field_name === 'supplier_name')?.field_value;
      const totalField = fields.find((f) => f.field_name === 'total' || f.field_name === 'contract_value')?.field_value;
      const currencyField = fields.find((f) => f.field_name === 'currency')?.field_value || 'INR';

      summaryData = {
        summary: `${doc.category.toUpperCase()} document "${doc.file_name}" issued for ${supplierField || 'vendor'} with total value of ${currencyField} ${totalField || 'N/A'}.`,
        keyPoints: [
          `Category: ${doc.category}`,
          `Supplier: ${supplierField || 'Unidentified'}`,
          `Commercial Total: ${currencyField} ${totalField || 'N/A'}`,
          `Page Count: ${doc.page_count || 1}`,
        ],
        riskLevel: 'low' as const,
        obligations: [],
        missingInformation: fields.filter((f) => f.is_missing).map((f) => f.field_name),
        isAiGenerated: false,
        modelUsed: 'deterministic-summary-engine',
      };
    }

    // Record audit event with verified user identity
    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Document Summarized',
      entity_type: 'document',
      entity_id: doc.id,
      entity_title: doc.file_name,
      details: `Generated executive summary briefing (${summaryData.modelUsed}).`,
    });

    return NextResponse.json({
      success: true,
      data: summaryData,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Document summarization failed';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
