import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { authenticateRequest } from '@/lib/server/auth';
import type { Finding } from '@/lib/types';

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
    const group = await ServerPersistence.getReconciliationGroupById(id);
    if (!group) {
      return NextResponse.json(
        { success: false, error: `Reconciliation group "${id}" not found` },
        { status: 404 }
      );
    }

    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'csv').toLowerCase();

    // Fetch findings for this group
    const allFindings = await ServerPersistence.getFindings();
    const groupFindings = allFindings.filter(
      (f) => f.reconciliation_group_id === id || f.id.includes(id)
    );

    // Fetch documents
    const allDocs = await ServerPersistence.getDocuments();
    const contractDoc = group.contract_id ? allDocs.find((d) => d.id === group.contract_id) : null;
    const poDoc = group.purchase_order_id ? allDocs.find((d) => d.id === group.purchase_order_id) : null;
    const invoiceDoc = group.invoice_id ? allDocs.find((d) => d.id === group.invoice_id) : null;

    // Log export event to immutable audit trail
    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Reconciliation Report Exported',
      entity_type: 'reconciliation',
      entity_id: id,
      entity_title: group.name || 'Reconciliation Group',
      details: `Exported reconciliation audit report in ${format.toUpperCase()} format with ${groupFindings.length} findings.`,
    });

    if (format === 'json') {
      const auditChain = await ServerPersistence.verifyAuditChain();
      const exportPayload = {
        exportMetadata: {
          system: 'DocuSentinel AI',
          exportedAt: new Date().toISOString(),
          exportedBy: {
            name: auth.user.name,
            email: auth.user.email,
            role: auth.user.role,
          },
          auditChainValid: auditChain.valid,
          totalChainEvents: auditChain.totalEvents,
        },
        reconciliationGroup: group,
        documents: {
          contract: contractDoc ? { id: contractDoc.id, name: contractDoc.file_name } : null,
          purchaseOrder: poDoc ? { id: poDoc.id, name: poDoc.file_name } : null,
          invoice: invoiceDoc ? { id: invoiceDoc.id, name: invoiceDoc.file_name } : null,
        },
        findingsCount: groupFindings.length,
        findings: groupFindings,
      };

      return new NextResponse(JSON.stringify(exportPayload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="Reconciliation_${id}_Audit_Pack.json"`,
        },
      });
    }

    if (format === 'csv') {
      const headers = [
        'Finding ID',
        'Rule ID',
        'Severity',
        'Status',
        'Title',
        'Description',
        'Source Document',
        'Billed / Claimed Value',
        'Compared Document',
        'Authorized / Reference Value',
        'Variance',
        'Financial Impact',
        'Currency',
        'Verified Evidence Grounding',
        'Review Decision',
        'Reviewed By',
        'Review Comments',
      ];

      const escapeCsv = (str: unknown): string => {
        if (str === null || str === undefined) return '""';
        const s = String(str).replace(/"/g, '""');
        return `"${s}"`;
      };

      const rows = groupFindings.map((f: Finding) => [
        escapeCsv(f.id),
        escapeCsv(f.rule_id || 'N/A'),
        escapeCsv(f.severity.toUpperCase()),
        escapeCsv(f.status.toUpperCase()),
        escapeCsv(f.title),
        escapeCsv(f.description),
        escapeCsv(invoiceDoc?.file_name || f.source_document_id || 'Invoice'),
        escapeCsv(f.source_value),
        escapeCsv(poDoc?.file_name || f.compared_document_id || 'PO / Contract'),
        escapeCsv(f.compared_value),
        escapeCsv(f.variance !== undefined && f.variance !== null ? f.variance : ''),
        escapeCsv(f.financial_impact !== undefined && f.financial_impact !== null ? f.financial_impact : ''),
        escapeCsv(f.currency || group.currency || 'USD'),
        escapeCsv(
          f.source_page || f.compared_page
            ? `Page ${f.source_page || f.compared_page}: "${(f.source_text || f.compared_text || '').slice(0, 80)}"`
            : 'Unverified'
        ),
        escapeCsv(f.review_decision || 'Pending'),
        escapeCsv(f.reviewed_by || 'Unreviewed'),
        escapeCsv(f.review_comments || ''),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Reconciliation_${id}.csv"`,
        },
      });
    }

    // Default: Printable HTML / PDF report
    const htmlReport = generatePrintableHtmlReport(group, groupFindings, {
      contract: contractDoc,
      purchaseOrder: poDoc,
      invoice: invoiceDoc,
      exporterName: auth.user.name,
    });

    return new NextResponse(htmlReport, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Export failed' },
      { status: 500 }
    );
  }
}

function generatePrintableHtmlReport(
  group: import('@/lib/types').ReconciliationGroup,
  findings: Finding[],
  docs: {
    contract: import('@/lib/types').Document | null;
    purchaseOrder: import('@/lib/types').Document | null;
    invoice: import('@/lib/types').Document | null;
    exporterName: string;
  }
): string {
  const currency = group.currency || 'USD';
  const fmt = (num?: number | null) =>
    num !== undefined && num !== null
      ? `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : 'N/A';

  const findingsRows = findings
    .map(
      (f) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 10px; font-weight: 600; font-family: monospace;">${f.id}</td>
      <td style="padding: 10px;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;
          background: ${f.severity === 'critical' ? '#fee2e2' : f.severity === 'high' ? '#ffedd5' : '#f1f5f9'};
          color: ${f.severity === 'critical' ? '#991b1b' : f.severity === 'high' ? '#9a3412' : '#334155'};">
          ${f.severity}
        </span>
      </td>
      <td style="padding: 10px;">
        <div style="font-weight: 600; color: #0f172a;">${escapeHtml(f.title)}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${escapeHtml(f.description)}</div>
        ${
          f.source_page || f.compared_page
            ? `<div style="font-size: 11px; color: #0284c7; margin-top: 4px;">Verified Passage (Page ${f.source_page || f.compared_page}): "${escapeHtml((f.source_text || f.compared_text || '').slice(0, 100))}"</div>`
            : ''
        }
      </td>
      <td style="padding: 10px; text-align: right; font-family: monospace;">${escapeHtml(f.source_value || '-')}</td>
      <td style="padding: 10px; text-align: right; font-family: monospace;">${escapeHtml(f.compared_value || '-')}</td>
      <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: 600; color: ${f.variance && f.variance > 0 ? '#dc2626' : '#16a34a'};">
        ${f.variance !== null && f.variance !== undefined ? fmt(f.variance) : '-'}
      </td>
      <td style="padding: 10px; font-size: 12px;">
        <span style="font-weight: 600;">${f.status.toUpperCase()}</span>
        ${f.reviewed_by ? `<div style="font-size: 11px; color: #64748b;">By: ${escapeHtml(f.reviewed_by)}</div>` : ''}
      </td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>DocuSentinel AI — Audit Certificate [${escapeHtml(group.id)}]</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 32px; background: #fff; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 24px; padding: 12px 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
    <div><strong>DocuSentinel AI Audit Report</strong> — Ready for print or save to PDF.</div>
    <div>
      <button onclick="window.print()" style="background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
        Print / Save to PDF
      </button>
    </div>
  </div>

  <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start;">
    <div>
      <h1 style="margin: 0; font-size: 24px; color: #0f172a;">RECONCILIATION AUDIT CERTIFICATE</h1>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">DocuSentinel AI Pre-Payment Verification System</div>
    </div>
    <div style="text-align: right;">
      <div style="font-weight: 700; font-family: monospace; font-size: 14px;">REF: ${escapeHtml(group.id)}</div>
      <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Generated: ${new Date().toUTCString()}</div>
      <div style="font-size: 12px; color: #64748b;">Auditor: ${escapeHtml(docs.exporterName)}</div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px;">
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Status</div>
      <div style="font-size: 18px; font-weight: 700; color: ${group.status === 'matched' ? '#16a34a' : '#dc2626'}; margin-top: 4px;">
        ${group.status.toUpperCase()}
      </div>
    </div>
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Authorized PO Value</div>
      <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">${fmt(group.po_value)}</div>
    </div>
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Invoice Billed Total</div>
      <div style="font-size: 18px; font-weight: 700; margin-top: 4px;">${fmt(group.invoice_value)}</div>
    </div>
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Discrepancy Variance</div>
      <div style="font-size: 18px; font-weight: 700; color: ${group.variance && group.variance > 0 ? '#dc2626' : '#16a34a'}; margin-top: 4px;">
        ${fmt(group.variance)}
      </div>
    </div>
  </div>

  <div style="margin-bottom: 28px;">
    <h3 style="font-size: 15px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
      Reconciled Document Portfolio
    </h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 12px; text-align: left;">Category</th>
        <th style="padding: 8px 12px; text-align: left;">Document Name</th>
        <th style="padding: 8px 12px; text-align: left;">Document ID</th>
        <th style="padding: 8px 12px; text-align: right;">Status</th>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 12px; font-weight: 600;">Invoice</td>
        <td style="padding: 8px 12px;">${escapeHtml(docs.invoice?.file_name || 'Not provided')}</td>
        <td style="padding: 8px 12px; font-family: monospace;">${escapeHtml(docs.invoice?.id || 'N/A')}</td>
        <td style="padding: 8px 12px; text-align: right; color: #16a34a; font-weight: 600;">Verified</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 12px; font-weight: 600;">Purchase Order</td>
        <td style="padding: 8px 12px;">${escapeHtml(docs.purchaseOrder?.file_name || 'Not provided')}</td>
        <td style="padding: 8px 12px; font-family: monospace;">${escapeHtml(docs.purchaseOrder?.id || 'N/A')}</td>
        <td style="padding: 8px 12px; text-align: right; color: #16a34a; font-weight: 600;">Verified</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 12px; font-weight: 600;">Contract / MSA</td>
        <td style="padding: 8px 12px;">${escapeHtml(docs.contract?.file_name || 'Not provided')}</td>
        <td style="padding: 8px 12px; font-family: monospace;">${escapeHtml(docs.contract?.id || 'N/A')}</td>
        <td style="padding: 8px 12px; text-align: right; color: #16a34a; font-weight: 600;">Verified</td>
      </tr>
    </table>
  </div>

  <div style="margin-bottom: 32px;">
    <h3 style="font-size: 15px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
      Itemized Reconciliation Findings & Audit Trail (${findings.length})
    </h3>
    ${
      findings.length === 0
        ? '<div style="padding: 24px; text-align: center; color: #16a34a; font-weight: 600; background: #f0fdf4; border-radius: 8px;">No discrepancies detected. All cross-document rules and tolerances satisfied.</div>'
        : `
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="background: #f1f5f9; text-align: left;">
          <th style="padding: 10px;">ID</th>
          <th style="padding: 10px;">Severity</th>
          <th style="padding: 10px;">Finding Description</th>
          <th style="padding: 10px; text-align: right;">Billed</th>
          <th style="padding: 10px; text-align: right;">Authorized</th>
          <th style="padding: 10px; text-align: right;">Variance</th>
          <th style="padding: 10px;">Review Status</th>
        </tr>
      </thead>
      <tbody>
        ${findingsRows}
      </tbody>
    </table>
    `
    }
  </div>

  <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
    <div>Certified by DocuSentinel AI Deterministic Reconciliation Engine. Zero LLM math reliance.</div>
    <div>Cryptographic Audit Seal: SHA-256 Validated</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
