# DocuSentinel AI — Intelligent Business Document Analysis & Reconciliation

Evidence-backed document intelligence platform engineered for enterprise accounts payable, procurement, and contract compliance. DocuSentinel AI provides server-side document parsing, AI extraction with citation grounding, deterministic 3-way matching across Contracts, Purchase Orders, and Invoices, human-in-the-loop review queues, and immutable audit logs.

---

## 1. Project Overview

DocuSentinel AI addresses invoice fraud, overbilling, and contract leakage through strict deterministic and AI-powered reconciliation:
- **Server-Side File Verification & Storage**: Validates file magic bytes (%PDF, PNG, JPEG, TIFF), MIME headers, file sizes (50MB cap), and computes SHA-256 digests for duplicate detection.
- **Multimodal AI & Deterministic Extraction**: Calls Gemini 2.5 Flash with structured runtime schemas, source confidence, and page references, paired with a deterministic text parser fallback.
- **Strict Reconciliation Engine**: Evaluates vendor identities, currency alignment, invoice vs. PO variances, master contract caps, subtotal + tax arithmetic, line-item quantities/rates, and chronological date relationships.
- **Evidence Traceability**: Grounds every discrepancy to exact document passages and page numbers.
- **Human-in-the-Loop Review**: Allows compliance officers to review, investigate, or dismiss anomalies with mandatory reviewer identification and rationale.
- **Persistent Data Store**: Atomic, thread-safe persistence layer maintaining documents, findings, reconciliations, reviews, and audit events.

---

## 2. Prerequisites

- **Node.js**: `v20.0.0` or higher (verified and tested on Node `v24.19.0`)
- **npm**: `v10.0.0` or higher (verified on npm `11.17.0`)
- **Operating System**: Windows 10/11, macOS, or Linux
- **Optional External Services**:
  - Google Gemini API key (for cloud AI extraction)
  - Supabase Project (PostgreSQL database and Object Storage)

---

## 3. Windows Installation Instructions

Open PowerShell or Command Prompt in the project folder:

```powershell
# Navigate into project directory
cd docusentinel

# Install dependencies using lockfile
npm ci
```

---

## 4. Environment Variable Setup

Copy the example environment configuration:

```powershell
cp .env.example .env.local
```

Configure the following variables in `.env.local`:

```env
# ============================================================
# NVIDIA NIM API (OpenAI-Compatible Endpoint)
# ============================================================
# Server-side only. Never prefix with NEXT_PUBLIC_
NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=openai/gpt-oss-20b

# ============================================================
# Google Gemini API (Fallback AI Document Extraction)
# ============================================================
# Server-side only. Never prefix with NEXT_PUBLIC_
GEMINI_API_KEY=your_gemini_api_key_here

# ============================================================
# Supabase Configuration (Optional for cloud production)
# ============================================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Storage Bucket Name
SUPABASE_STORAGE_BUCKET=documents
```

> **Security Note**: `NVIDIA_API_KEY`, `GEMINI_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must never be exposed to client-side code, browser storage, or Git.

---

## 5. NVIDIA API Integration & Setup

DocuSentinel AI integrates NVIDIA's OpenAI-compatible NIM endpoint for intelligent document extraction, structured summarization, finding explanations, and cross-document semantic comparison:

### API Configuration
- **Base URL**: `https://integrate.api.nvidia.com/v1`
- **Default Model**: `openai/gpt-oss-20b`
- **SDK**: Official `openai` package configured with NVIDIA's endpoint.

### Configuration Steps
1. Obtain an API key from the [NVIDIA API Catalog](https://build.nvidia.com/).
2. Add your credentials to `.env.local`:
   ```env
   NVIDIA_API_KEY=nvapi-your-key-here
   NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
   NVIDIA_MODEL=openai/gpt-oss-20b
   ```
3. Restart or start the application (`npm run dev` or `npm run build && npm run start`).

### Key Capabilities
- **Structured Extraction**: Extracts document type, vendor identity, document IDs, effective and expiry dates, currency, line items, totals, payment terms, legal obligations, and identifies missing mandatory fields.
- **Document Summarization** (`POST /api/documents/[id]/summarize`): Generates an executive briefing with commercial summary, key points, risk rating, obligations, and missing info.
- **Evidence-Grounded Explanations** (`POST /api/findings/[id]/explain`): Explains discrepancies using strictly verified source passages without fabricating quotes or page numbers. Clearly flags output as AI-generated (`isAiGenerated: true`).
- **Semantic Cross-Document Comparison** (`POST /api/reconciliation/compare`): Analyzes semantic consistency across Contracts, POs, and Invoices.
- **Architectural Safeguards**:
  - **Prompt Injection Defense**: Document text is isolated inside `<untrusted_document_content>` tags with strict system instructions prohibiting override execution.
  - **Deterministic Financial Validation**: All monetary totals, variances, tax calculations, and discrepancy decisions remain 100% deterministic in `src/lib/reconciliation/engine.ts`.
  - **Graceful Multi-Tier Fallback**: If NVIDIA is offline or rate-limited (HTTP 429), the pipeline automatically cascades to Gemini, and then to the deterministic extraction engine without interrupting the user.

### Testing the NVIDIA Integration
- Run the automated test suite (includes 8 dedicated NVIDIA mock tests):
  ```bash
  npm test
  ```
  Tests verify successful extraction, malformed JSON recovery, missing credentials handling, provider 401/429 error cascades, summarization, finding explanations, prompt injection defense, and arithmetic determinism — all without consuming live credits or requiring an external network connection.

---

## 6. Gemini API Setup (Secondary Fallback)

1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/).
2. Set `GEMINI_API_KEY=AIzaSy...` in `.env.local`.
3. When neither NVIDIA nor Gemini credentials are configured, DocuSentinel AI operates in **Deterministic Fallback Mode**, parsing text directly from document text streams using regex heuristics without fabricating values or failing.

---

## 7. Supabase Project Setup & Database Migrations

When connecting to Supabase:
1. Create a new project in the [Supabase Dashboard](https://database.new).
2. Navigate to the **SQL Editor**.
3. Open `supabase/schema.sql` from this repository.
4. Execute the SQL script. This sets up:
   - `documents`, `extracted_fields`, `line_items`, `reconciliation_groups`, `findings`, `audit_events`, and `case_history` tables.
   - Row-Level Security (RLS) policies guaranteeing cross-user isolation.
   - Triggers for timestamp updates and audit logs.

### Storage Bucket & Access Policies
1. In the Supabase Dashboard, create a **Private** bucket named `documents`.
2. Apply the RLS policy from `supabase/schema.sql`:
   ```sql
   CREATE POLICY "Authenticated users can access their own documents"
   ON storage.objects FOR ALL TO authenticated
   USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
   ```

---

## 8. Local Development Commands

```powershell
# Start Next.js development server
npm run dev

# Run test suite (Unit & Integration tests)
npm test

# Run TypeScript type check
npx tsc --noEmit

# Run ESLint check
npm run lint

# Build for production
npm run build

# Start production server
npm run start
```

---

## 9. Demo Mode Instructions

DocuSentinel AI includes full offline demo functionality:
1. No external API keys or cloud database connections are mandatory for local testing.
2. In Demo Mode, the server stores uploaded documents in `.data/storage/` and persists relational state in `.data/db.json`.
3. Pre-seeded business cases (Contract Agreement ₹10L, Purchase Order ₹8.5L, and Invoice ₹9.2L) are available for immediate reconciliation.
4. To reset all data back to the clean demonstration baseline, click **Reset Demo Data** in the UI or call `POST /api/demo/reset`.

---

## 10. Reconciliation Engine Rules & Logic

DocuSentinel AI enforces 10 deterministic reconciliation rules:
1. **Rule 1 — Supplier Matching**: Token-based Jaccard similarity normalizing corporate legal suffixes (`Pvt Ltd`, `LLC`, `Inc`).
2. **Rule 2 — Distinct Vendor Safeguard**: Strict threshold preventing false-positive matches across distinct entities.
3. **Rule 3 — Currency Guard**: Currency mismatches halt cross-currency arithmetic and trigger critical findings.
4. **Rule 4 — 3-Way Variance Tracking**: Invoice ₹9,20,000 vs PO ₹8,50,000 flags ₹70,000 overbilling while confirming it remains within master Contract limit (₹10,00,000).
5. **Rule 5 — Rounding & Sub-Cent Tolerance**: Decimal comparisons use a configurable 0.05 tolerance.
6. **Rule 6 — Line Item Discrepancies**: Compares description, quantity, and unit rate line-by-line.
7. **Rule 7 — Arithmetic Validation**: Validates that `Subtotal + Tax = Total`.
8. **Rule 8 — Duplicate Detection**: Compares incoming invoice numbers against existing records.
9. **Rule 9 — PO Reference Verification**: Flags invoices omitting or misreferencing purchase orders.
10. **Rule 10 — Chronological Sanity**: Flags payment due dates occurring before invoice dates, or invoices predating authorizing POs.

---

## 11. Troubleshooting

| Issue | Resolution |
|---|---|
| **EADDRINUSE: 3000** | Run `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force` on Windows to free port 3000. |
| **`pdf-parse` Type Warning** | `@types/pdf-parse` is installed. ESM imports use dynamic `createRequire(import.meta.url)` to guarantee compatibility across Node versions. |
| **Missing NVIDIA / Gemini API Key** | DocuSentinel runs safely in offline fallback mode with genuine parsed text extraction. |
| **Database Permissions** | Check that `.data/` directory in project root has write permissions. |

---

## 12. Known Limitations

- **Scanned Image OCR**: Scanned raster images require an active `GEMINI_API_KEY` for vision-based OCR extraction. Plain-text and searchable PDFs extract offline using `pdf-parse`.
- **Cross-Currency Arithmetic**: Automatic currency conversion is intentionally disallowed by audit rule; cross-currency documents are flagged for human financial review.
- **Unsupported Formats**: Word (.docx) and Excel (.xlsx) files are rejected on the server until dedicated parsers are attached.
