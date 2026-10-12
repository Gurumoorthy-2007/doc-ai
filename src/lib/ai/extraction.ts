// ============================================================
// DocuSentinel AI — AI Document Extraction Service
// Server-side only — uses Gemini API
// ============================================================

import type {
  ContractExtraction,
  PurchaseOrderExtraction,
  InvoiceExtraction,
  ExtractionResult,
  DocumentCategory,
} from '@/lib/types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// ============================================================
// Gemini API Integration
// ============================================================

async function callGeminiForExtraction(
  base64Content: string,
  mimeType: string,
  category: DocumentCategory
): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured. Set it in .env.local or enable DEMO_MODE.');
  }

  const prompt = buildExtractionPrompt(category);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Content,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini API returned empty response');
  }

  const parsed = JSON.parse(text);
  return validateAndNormalize(parsed, category);
}

function buildExtractionPrompt(category: DocumentCategory): string {
  const baseInstruction = `You are a document extraction AI. Extract structured information from this business document. Return ONLY valid JSON with no additional text. If a field cannot be found, set it to null. Do NOT invent or fabricate values.`;

  switch (category) {
    case 'contract':
      return `${baseInstruction}

Extract contract information with this exact JSON schema:
{
  "contract_number": string or null,
  "parties": string[] (list of party names),
  "supplier_name": string or null,
  "contract_value": number or null (numeric only, no currency symbol),
  "currency": string or null (3-letter code like "INR", "USD"),
  "effective_date": string or null (ISO date format YYYY-MM-DD),
  "expiry_date": string or null (ISO date format YYYY-MM-DD),
  "payment_terms": string or null,
  "deadlines": string[] (key deadlines),
  "obligations": string[] (key obligations)
}`;

    case 'purchase_order':
      return `${baseInstruction}

Extract purchase order information with this exact JSON schema:
{
  "po_number": string or null,
  "supplier_name": string or null,
  "currency": string or null (3-letter code),
  "order_date": string or null (ISO date YYYY-MM-DD),
  "expected_delivery_date": string or null (ISO date YYYY-MM-DD),
  "payment_terms": string or null,
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "line_items": [
    {
      "description": string,
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null,
      "unit": string or null
    }
  ]
}`;

    case 'invoice':
      return `${baseInstruction}

Extract invoice information with this exact JSON schema:
{
  "invoice_number": string or null,
  "supplier_name": string or null,
  "invoice_date": string or null (ISO date YYYY-MM-DD),
  "due_date": string or null (ISO date YYYY-MM-DD),
  "currency": string or null (3-letter code),
  "po_reference": string or null,
  "payment_terms": string or null,
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "line_items": [
    {
      "description": string,
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null,
      "unit": string or null
    }
  ]
}`;

    default:
      return `${baseInstruction}

Extract any relevant business document information as JSON with fields like:
{
  "document_type": string,
  "document_number": string or null,
  "date": string or null,
  "parties": string[],
  "total_amount": number or null,
  "currency": string or null,
  "summary": string
}`;
  }
}

function validateAndNormalize(
  data: Record<string, unknown>,
  category: DocumentCategory
): ExtractionResult {
  switch (category) {
    case 'contract': {
      const normalized: ContractExtraction = {
        contract_number: typeof data.contract_number === 'string' ? data.contract_number : null,
        parties: Array.isArray(data.parties) ? data.parties.filter((p: unknown) => typeof p === 'string') : [],
        supplier_name: typeof data.supplier_name === 'string' ? data.supplier_name : null,
        contract_value: typeof data.contract_value === 'number' ? data.contract_value : null,
        currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : null,
        effective_date: typeof data.effective_date === 'string' ? data.effective_date : null,
        expiry_date: typeof data.expiry_date === 'string' ? data.expiry_date : null,
        payment_terms: typeof data.payment_terms === 'string' ? data.payment_terms : null,
        deadlines: Array.isArray(data.deadlines) ? data.deadlines.filter((d: unknown) => typeof d === 'string') : [],
        obligations: Array.isArray(data.obligations) ? data.obligations.filter((o: unknown) => typeof o === 'string') : [],
      };
      return { type: 'contract', data: normalized };
    }
    case 'purchase_order': {
      const normalized: PurchaseOrderExtraction = {
        po_number: typeof data.po_number === 'string' ? data.po_number : null,
        supplier_name: typeof data.supplier_name === 'string' ? data.supplier_name : null,
        currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : null,
        order_date: typeof data.order_date === 'string' ? data.order_date : null,
        expected_delivery_date: typeof data.expected_delivery_date === 'string' ? data.expected_delivery_date : null,
        payment_terms: typeof data.payment_terms === 'string' ? data.payment_terms : null,
        subtotal: typeof data.subtotal === 'number' ? data.subtotal : null,
        tax: typeof data.tax === 'number' ? data.tax : null,
        total: typeof data.total === 'number' ? data.total : null,
        line_items: Array.isArray(data.line_items)
          ? data.line_items.map((item: Record<string, unknown>) => ({
              description: typeof item.description === 'string' ? item.description : '',
              quantity: typeof item.quantity === 'number' ? item.quantity : null,
              unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
              amount: typeof item.amount === 'number' ? item.amount : null,
              unit: typeof item.unit === 'string' ? item.unit : null,
            }))
          : [],
      };
      return { type: 'purchase_order', data: normalized };
    }
    case 'invoice': {
      const normalized: InvoiceExtraction = {
        invoice_number: typeof data.invoice_number === 'string' ? data.invoice_number : null,
        supplier_name: typeof data.supplier_name === 'string' ? data.supplier_name : null,
        invoice_date: typeof data.invoice_date === 'string' ? data.invoice_date : null,
        due_date: typeof data.due_date === 'string' ? data.due_date : null,
        currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : null,
        po_reference: typeof data.po_reference === 'string' ? data.po_reference : null,
        payment_terms: typeof data.payment_terms === 'string' ? data.payment_terms : null,
        subtotal: typeof data.subtotal === 'number' ? data.subtotal : null,
        tax: typeof data.tax === 'number' ? data.tax : null,
        total: typeof data.total === 'number' ? data.total : null,
        line_items: Array.isArray(data.line_items)
          ? data.line_items.map((item: Record<string, unknown>) => ({
              description: typeof item.description === 'string' ? item.description : '',
              quantity: typeof item.quantity === 'number' ? item.quantity : null,
              unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
              amount: typeof item.amount === 'number' ? item.amount : null,
              unit: typeof item.unit === 'string' ? item.unit : null,
            }))
          : [],
      };
      return { type: 'invoice', data: normalized };
    }
    default:
      return { type: 'invoice', data: data as unknown as InvoiceExtraction };
  }
}

// ============================================================
// Demo Mode — Explicitly labelled fake data for local testing
// ============================================================

function generateDemoExtraction(category: DocumentCategory): ExtractionResult {
  console.warn('[DEMO MODE] Generating demo extraction data — not from actual document');

  switch (category) {
    case 'contract':
      return {
        type: 'contract',
        data: {
          contract_number: 'DEMO-CTR-001',
          parties: ['Demo Corp (DEMO DATA)', 'Demo Supplier Ltd (DEMO DATA)'],
          supplier_name: 'Demo Supplier Ltd (DEMO DATA)',
          contract_value: 500000,
          currency: 'INR',
          effective_date: '2025-01-01',
          expiry_date: '2025-12-31',
          payment_terms: 'Net 30 (DEMO)',
          deadlines: ['Q1 Review - Mar 31 (DEMO)'],
          obligations: ['Monthly reporting (DEMO)'],
        },
      };
    case 'purchase_order':
      return {
        type: 'purchase_order',
        data: {
          po_number: 'DEMO-PO-12345',
          supplier_name: 'Demo Supplier Ltd (DEMO DATA)',
          currency: 'INR',
          order_date: '2025-04-01',
          expected_delivery_date: '2025-04-15',
          payment_terms: 'Net 30 (DEMO)',
          subtotal: 75000,
          tax: 13500,
          total: 88500,
          line_items: [
            { description: 'Office Supplies (DEMO)', quantity: 100, unit_price: 500, amount: 50000, unit: 'pcs' },
            { description: 'Printer Paper (DEMO)', quantity: 50, unit_price: 500, amount: 25000, unit: 'reams' },
          ],
        },
      };
    case 'invoice':
      return {
        type: 'invoice',
        data: {
          invoice_number: 'DEMO-INV-4827',
          supplier_name: 'Demo Supplier Ltd (DEMO DATA)',
          invoice_date: '2025-04-18',
          due_date: '2025-05-18',
          currency: 'INR',
          po_reference: 'DEMO-PO-12345',
          payment_terms: 'Net 30 (DEMO)',
          subtotal: 75000,
          tax: 13500,
          total: 88500,
          line_items: [
            { description: 'Office Supplies (DEMO)', quantity: 100, unit_price: 500, amount: 50000, unit: 'pcs' },
            { description: 'Printer Paper (DEMO)', quantity: 50, unit_price: 500, amount: 25000, unit: 'reams' },
          ],
        },
      };
    default:
      return {
        type: 'invoice',
        data: {
          invoice_number: 'DEMO-DOC-001',
          supplier_name: 'Demo Vendor (DEMO DATA)',
          invoice_date: '2025-04-01',
          due_date: null,
          currency: 'INR',
          po_reference: null,
          payment_terms: null,
          subtotal: null,
          tax: null,
          total: null,
          line_items: [],
        },
      };
  }
}

// ============================================================
// Main Extraction Function
// ============================================================

export async function extractDocument(
  fileContent: Buffer | string,
  mimeType: string,
  category: DocumentCategory
): Promise<ExtractionResult> {
  // Use demo mode if configured or API key is missing
  if (DEMO_MODE || !GEMINI_API_KEY) {
    if (!DEMO_MODE) {
      console.warn(
        'GEMINI_API_KEY not set. Falling back to DEMO MODE. Set the key in .env.local for real extraction.'
      );
    }
    return generateDemoExtraction(category);
  }

  const base64 =
    typeof fileContent === 'string'
      ? fileContent
      : fileContent.toString('base64');

  return callGeminiForExtraction(base64, mimeType, category);
}

export function isUsingDemoMode(): boolean {
  return DEMO_MODE || !GEMINI_API_KEY;
}
