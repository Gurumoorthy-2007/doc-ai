// ============================================================
// DocuSentinel AI — Content-Based Document Classification
// Replaces fragile substring checks with content-driven NLP heuristics,
// strict word-boundary token matching, and user confirmation gating.
// Never silently defaults to 'invoice'.
// ============================================================

import type { DocumentCategory } from '../types';

export interface ClassificationResult {
  category: DocumentCategory;
  confidence: number;
  matchedKeywords: string[];
  requiresConfirmation: boolean;
  reason: string;
}

interface CategoryRule {
  category: DocumentCategory;
  primaryPatterns: RegExp[];
  secondaryPatterns: RegExp[];
  negativePatterns?: RegExp[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'purchase_order',
    primaryPatterns: [
      /\b(?:purchase\s+order|p\.o\.\s*#|p\.o\.\s+number|po\s*#|po\s+number)\b/i,
      /\b(?:order\s+date|deliver\s+to|ship\s+to|authorized\s+purchaser)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:buyer|vendor\s+code|procurement|requisition(?:\s+number)?)\b/i,
      /\b(?:vendor\s+name|payment\s+will\s+be\s+made\s+upon\s+receipt)\b/i,
    ],
    negativePatterns: [
      /\b(?:tax\s+invoice|commercial\s+invoice|final\s+invoice|billing\s+statement)\b/i,
    ],
  },
  {
    category: 'invoice',
    primaryPatterns: [
      /\b(?:tax\s+invoice|commercial\s+invoice|proforma\s+invoice|retail\s+invoice)\b/i,
      /\b(?:invoice\s*#|invoice\s+no|invoice\s+number|invoice\s+date)\b/i,
      /\b(?:bill\s+to|billed\s+to|remit\s+to|amount\s+due|subtotal|balance\s+due)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:gstin|cgst|sgst|igst|hsn(?:\/sac)?|vat\s+registration)\b/i,
      /\b(?:payment\s+due|bank\s+transfer|wire\s+transfer|due\s+date|taxable\s+value)\b/i,
    ],
  },
  {
    category: 'contract',
    primaryPatterns: [
      /\b(?:master\s+services\s+agreement|msa|non-disclosure\s+agreement|nda)\b/i,
      /\b(?:statement\s+of\s+work|sow|contract\s+agreement|services\s+agreement)\b/i,
      /\b(?:this\s+agreement\s+is\s+(?:made|entered)|by\s+and\s+between)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:indemnification|governing\s+law|severability|confidentiality\s+clause)\b/i,
      /\b(?:force\s+majeure|term\s+and\s+termination|intellectual\s+property\s+rights)\b/i,
      /\b(?:witnesseth|now\s+therefore|in\s+consideration\s+of)\b/i,
    ],
  },
  {
    category: 'receipt',
    primaryPatterns: [
      /\b(?:payment\s+receipt|official\s+receipt|cash\s+receipt|transaction\s+receipt)\b/i,
      /\b(?:receipt\s*#|receipt\s+no|receipt\s+number|receipt\s+voucher)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:received\s+from|amount\s+received|paid\s+in\s+full|mode\s+of\s+payment)\b/i,
    ],
  },
  {
    category: 'statement',
    primaryPatterns: [
      /\b(?:account\s+statement|bank\s+statement|billing\s+statement|statement\s+of\s+account)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:opening\s+balance|closing\s+balance|credit\s+limit|available\s+credit|statement\s+period)\b/i,
    ],
  },
  {
    category: 'compliance',
    primaryPatterns: [
      /\b(?:certificate\s+of\s+compliance|compliance\s+certificate|certificate\s+of\s+conformity)\b/i,
      /\b(?:iso\s*9001|iso\s*27001|iso\s*14001|soc\s*1|soc\s*2|soc\s*3)\b/i,
    ],
    secondaryPatterns: [
      /\b(?:audit\s+report|attestation|regulatory\s+compliance|certification\s+body)\b/i,
    ],
  },
];

/**
 * Strict filename classifier using word boundaries only.
 * Avoids substring bugs like 'po' matching 'report' or 'opportunity'.
 */
function classifyFileName(fileName?: string): { category: DocumentCategory; confidence: number } | null {
  if (!fileName) return null;
  const clean = fileName.trim().toLowerCase();

  // Strict word-boundary checks on file name
  if (/(?:^|[\s_.\-])(?:purchase[-_]order|p\.o\.|po)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'purchase_order', confidence: 0.65 };
  }
  if (/(?:^|[\s_.\-])(?:inv|invoice|bill)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'invoice', confidence: 0.65 };
  }
  if (/(?:^|[\s_.\-])(?:contract|agreement|msa|sow|nda)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'contract', confidence: 0.65 };
  }
  if (/(?:^|[\s_.\-])(?:receipt)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'receipt', confidence: 0.65 };
  }
  if (/(?:^|[\s_.\-])(?:statement)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'statement', confidence: 0.65 };
  }
  if (/(?:^|[\s_.\-])(?:compliance|iso\d+|soc\d+)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'compliance', confidence: 0.65 };
  }

  // Reports, summaries, notes explicitly do NOT map to PO or invoice
  if (/(?:^|[\s_.\-])(?:report|summary|presentation|proposal|notes)(?:$|[\s_.\-0-9])/i.test(clean)) {
    return { category: 'other', confidence: 0.70 };
  }

  return null;
}

/**
 * Classifies document content based on structural phrases, weighted pattern matches,
 * and header prominence. Never silently defaults to 'invoice'.
 */
export function classifyDocumentContent(
  textContent: string | null | undefined,
  fileName?: string
): ClassificationResult {
  const text = (textContent || '').trim();
  const headerText = text.substring(0, 1000); // Prominent header section

  const scores: Record<DocumentCategory, { score: number; primaryMatches: number; matches: string[] }> = {
    invoice: { score: 0, primaryMatches: 0, matches: [] },
    purchase_order: { score: 0, primaryMatches: 0, matches: [] },
    contract: { score: 0, primaryMatches: 0, matches: [] },
    receipt: { score: 0, primaryMatches: 0, matches: [] },
    statement: { score: 0, primaryMatches: 0, matches: [] },
    compliance: { score: 0, primaryMatches: 0, matches: [] },
    other: { score: 0, primaryMatches: 0, matches: [] },
  };

  // Explicit non-reconciliation report check
  const isReport = /\b(?:financial\s+report|annual\s+report|quarterly\s+report|operational\s+report|status\s+report|progress\s+report|board\s+of\s+directors|executive\s+summary)\b/i.test(headerText);
  if (isReport) {
    scores.other.score += 6.0;
    scores.other.matches.push('Header: Non-commercial general report pattern');
  }

  // Evaluate each rule
  for (const rule of CATEGORY_RULES) {
    // 1. Primary patterns (Weight: 4 in header, 2.5 in body)
    for (const pat of rule.primaryPatterns) {
      if (pat.test(headerText)) {
        scores[rule.category].score += 4.0;
        scores[rule.category].primaryMatches++;
        scores[rule.category].matches.push(`Header: ${pat.source}`);
      } else if (pat.test(text)) {
        scores[rule.category].score += 2.5;
        scores[rule.category].primaryMatches++;
        scores[rule.category].matches.push(`Body: ${pat.source}`);
      }
    }

    // 2. Secondary patterns (Weight: 2 in header, 1 in body)
    for (const pat of rule.secondaryPatterns) {
      if (pat.test(headerText)) {
        scores[rule.category].score += 2.0;
        scores[rule.category].matches.push(`Header: ${pat.source}`);
      } else if (pat.test(text)) {
        scores[rule.category].score += 1.0;
        scores[rule.category].matches.push(`Body: ${pat.source}`);
      }
    }

    // 3. Negative patterns (Discount score if mutually exclusive terms found)
    if (rule.negativePatterns) {
      for (const pat of rule.negativePatterns) {
        if (pat.test(headerText)) {
          scores[rule.category].score = Math.max(0, scores[rule.category].score - 3.0);
        }
      }
    }
  }

  // Check filename auxiliary signal
  const fileClue = classifyFileName(fileName);
  if (fileClue?.category === 'other') {
    scores.other.score += 3.0;
  }

  // If other has higher score than any specific category, or report detected
  if (scores.other.score > 0 && scores.other.score >= scores.purchase_order.score && scores.other.score >= scores.invoice.score) {
    return {
      category: 'other',
      confidence: 0.85,
      matchedKeywords: scores.other.matches,
      requiresConfirmation: true,
      reason: `Document identified as general report or non-reconciliation document.`,
    };
  }

  // Find commercial category with highest score
  const sortedCategories = (Object.keys(scores) as DocumentCategory[])
    .filter((cat) => cat !== 'other')
    .sort((a, b) => scores[b].score - scores[a].score);

  const topCategory = sortedCategories[0];
  const topScore = scores[topCategory].score;
  const topPrimary = scores[topCategory].primaryMatches;
  const runnerUpCategory = sortedCategories[1];
  const runnerUpScore = scores[runnerUpCategory]?.score || 0;

  // If text is minimal (e.g. scanned image with no text yet)
  if (text.length < 30) {
    if (fileClue && fileClue.category !== 'other') {
      return {
        category: fileClue.category,
        confidence: fileClue.confidence,
        matchedKeywords: [`Filename heuristic (${fileName})`],
        requiresConfirmation: true, // Requires user confirmation due to low text confidence
        reason: `Text is minimal or unextracted. Inferred "${fileClue.category}" from sanitized filename pattern.`,
      };
    }
    return {
      category: 'other',
      confidence: 0,
      matchedKeywords: [],
      requiresConfirmation: true,
      reason: 'Document text is empty or insufficient to classify. Requires user selection.',
    };
  }

  // A purchase order or invoice MUST have at least one primary match to qualify as strong
  if (topScore >= 3.0 && (topPrimary > 0 || (topCategory !== 'purchase_order' && topCategory !== 'invoice'))) {
    // If there is significant ambiguity between invoice and PO (e.g. invoice quoting a PO number)
    const isAmbiguous = runnerUpScore > 0 && topScore - runnerUpScore < 1.5;
    const confidence = Math.min(0.99, Number((0.55 + Math.min(0.40, topScore * 0.05)).toFixed(2)));

    return {
      category: topCategory,
      confidence: isAmbiguous ? Math.min(confidence, 0.75) : confidence,
      matchedKeywords: scores[topCategory].matches,
      requiresConfirmation: isAmbiguous,
      reason: isAmbiguous
        ? `Classified as "${topCategory}" with close runner-up "${runnerUpCategory}". User confirmation recommended.`
        : `Strong content match for "${topCategory}" (${scores[topCategory].matches.length} key structural patterns detected).`,
    };
  }

  // Moderate content match (score between 1.5 and 3.0)
  if (topScore >= 1.5) {
    return {
      category: topCategory,
      confidence: 0.65,
      matchedKeywords: scores[topCategory].matches,
      requiresConfirmation: true,
      reason: `Moderate content match for "${topCategory}". User confirmation recommended.`,
    };
  }

  // If content has no dominant patterns, check if filename signals a non-reconciliation type
  if (fileClue?.category === 'other') {
    return {
      category: 'other',
      confidence: 0.70,
      matchedKeywords: ['Non-reconciliation document pattern'],
      requiresConfirmation: true,
      reason: `Document identified as general report or non-reconciliation document (${fileName}). User confirmation required.`,
    };
  }

  // NO SILENT DEFAULT TO 'invoice': Return 'other' with requiresConfirmation: true
  return {
    category: 'other',
    confidence: 0.20,
    matchedKeywords: [],
    requiresConfirmation: true,
    reason: 'Document content does not match standard financial document structures. Requires user confirmation.',
  };
}
