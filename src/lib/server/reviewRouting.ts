// ============================================================
// DocuSentinel AI — Field Confidence & Review Queue Router
// Evaluates per-field confidence against configurable threshold
// and automatically routes low-confidence or unverified fields
// to the human review queue as data_validation findings.
// ============================================================

import type { Document, ExtractedField, Finding } from '../types';
import { ServerPersistence } from './persistence';

export const CONFIDENCE_REVIEW_THRESHOLD = parseFloat(
  process.env.CONFIDENCE_REVIEW_THRESHOLD || '0.80'
);

/**
 * Checks extracted fields and automatically generates data_validation findings
 * for any field that fails passage verification or falls below the confidence threshold.
 */
export async function routeLowConfidenceFieldsToReview(
  doc: Document | null | undefined,
  fields: ExtractedField[],
  threshold = CONFIDENCE_REVIEW_THRESHOLD
): Promise<Finding[]> {
  if (!doc || !fields || fields.length === 0) return [];

  const reviewFindings: Finding[] = [];
  const nowIso = new Date().toISOString();

  for (const field of fields) {
    // Only evaluate present fields (missing fields have dedicated missing_field findings in reconciliation)
    if (field.is_missing || field.field_value === null || field.field_value === '') {
      continue;
    }

    const isUnverified = field.verified === false;
    const isLowConfidence = field.confidence !== null && field.confidence < threshold;

    if (isUnverified || isLowConfidence) {
      const severity = isUnverified ? 'medium' : 'low';
      const title = isUnverified
        ? `Unverified Passage: ${field.field_name.replace(/_/g, ' ')}`
        : `Low Extraction Confidence: ${field.field_name.replace(/_/g, ' ')}`;

      const confidencePct = field.confidence !== null ? Math.round(field.confidence * 100) : 0;
      const description = isUnverified
        ? `Extracted value "${field.field_value}" for ${field.field_name} could not be verified in the document text stream. Manual verification required before automated settlement.`
        : `Extracted value "${field.field_value}" for ${field.field_name} has confidence ${confidencePct}%, below the required ${Math.round(threshold * 100)}% threshold.`;

      const reason = isUnverified
        ? `Ground-truth text search failed to locate passage "${field.source_text || field.field_value}" in document pages. Field marked unverified.`
        : `Extraction model confidence score (${confidencePct}%) is lower than policy threshold (${Math.round(threshold * 100)}%).`;

      const findingId = `fnd-val-${doc.id}-${field.field_name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      reviewFindings.push({
        id: findingId,
        user_id: doc.user_id,
        rule_id: isUnverified ? 'RULE-UNVERIFIED-PASSAGE' : 'RULE-LOW-CONFIDENCE',
        reconciliation_group_id: null,
        finding_type: 'data_validation',
        severity,
        status: 'open',
        title,
        description,
        reason,
        source_document_id: doc.id,
        compared_document_id: null,
        source_value: field.field_value,
        compared_value: null,
        variance: null,
        financial_impact: null,
        currency: null,
        calculation_method: 'Ground-truth evidence verification',
        source_field: field.field_name,
        source_page: field.source_page,
        source_text: field.source_text,
        source_verified: field.verified !== false,
        source_bounding_box: field.bounding_box || null,
        compared_field: null,
        compared_page: null,
        compared_text: null,
        compared_verified: true,
        compared_bounding_box: null,
        reviewed_by: null,
        reviewed_at: null,
        is_reviewed: false,
        review_decision: null,
        review_comments: null,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  if (reviewFindings.length > 0) {
    await ServerPersistence.saveFindings(reviewFindings);
  }

  return reviewFindings;
}
