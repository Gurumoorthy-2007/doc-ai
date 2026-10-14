import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { isNvidiaConfigured, explainFindingWithNvidia } from '@/lib/ai/nvidia';

export async function POST(
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

    // Retrieve verified source evidence
    let sourceEvidence = {
      text: finding.source_text,
      page: finding.source_page,
      field: finding.source_field,
      value: finding.source_value,
    };

    if (finding.source_document_id && (!sourceEvidence.text || !sourceEvidence.value)) {
      const srcFields = await ServerPersistence.getExtractedFields(finding.source_document_id);
      const match = srcFields.find((f) => f.field_name === finding.source_field);
      if (match) {
        sourceEvidence = {
          text: match.source_text || sourceEvidence.text,
          page: match.source_page ?? sourceEvidence.page,
          field: match.field_name,
          value: match.field_value ?? sourceEvidence.value,
        };
      }
    }

    // Retrieve verified compared evidence
    let comparedEvidence = {
      text: finding.compared_text,
      page: finding.compared_page,
      field: finding.compared_field,
      value: finding.compared_value,
    };

    if (finding.compared_document_id && (!comparedEvidence.text || !comparedEvidence.value)) {
      const cmpFields = await ServerPersistence.getExtractedFields(finding.compared_document_id);
      const match = cmpFields.find((f) => f.field_name === finding.compared_field);
      if (match) {
        comparedEvidence = {
          text: match.source_text || comparedEvidence.text,
          page: match.source_page ?? comparedEvidence.page,
          field: match.field_name,
          value: match.field_value ?? comparedEvidence.value,
        };
      }
    }

    let explanationData;
    if (isNvidiaConfigured()) {
      explanationData = await explainFindingWithNvidia(
        finding,
        sourceEvidence,
        comparedEvidence
      );
    } else {
      // Deterministic evidence-grounded fallback
      explanationData = {
        findingId: finding.id,
        title: finding.title,
        explanation: `${finding.description} (Deterministic forensic rule analysis).`,
        rootCause: finding.reason || 'Variance between source document and reference contract or purchase order.',
        recommendedAction: 'Verify source quotation and request clarification or amended invoice from supplier.',
        confidence: 0.95,
        evidence: {
          sourceField: sourceEvidence.field,
          sourceValue: sourceEvidence.value,
          sourcePage: sourceEvidence.page,
          sourcePassage: sourceEvidence.text,
          comparedField: comparedEvidence.field,
          comparedValue: comparedEvidence.value,
          comparedPage: comparedEvidence.page,
          comparedPassage: comparedEvidence.text,
        },
        isAiGenerated: false,
        modelUsed: 'deterministic-explanation-engine',
      };
    }

    // Record audit event
    await ServerPersistence.addAuditEvent({
      user_name: 'Gurumoorthy S',
      user_email: 'gurumoorthy@docusentinel.ai',
      action: 'Finding Explained by AI',
      entity_type: 'finding',
      entity_id: finding.id,
      entity_title: finding.title,
      details: `Generated evidence-grounded explanation (${explanationData.modelUsed}).`,
    });

    return NextResponse.json({
      success: true,
      data: explanationData,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Failed to explain finding';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
