import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { reconcileDocuments, checkDuplicateInvoice, type DocumentData } from '@/lib/reconciliation/engine';
import { authenticateRequest, checkDocumentOwnership } from '@/lib/server/auth';
import type { ReconciliationGroup, Finding } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const userIdFilter = auth.user.role === 'admin' || auth.user.role === 'reviewer' ? undefined : auth.user.id;
    const groups = await ServerPersistence.getReconciliationGroups(userIdFilter);
    return NextResponse.json({ success: true, data: groups });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch reconciliation groups' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { contractId, purchaseOrderId, invoiceId, groupName } = body;

    const allDocs = await ServerPersistence.getDocuments();
    const allFields = await ServerPersistence.getExtractedFields();
    const allLineItems = await ServerPersistence.getLineItems();

    const buildDocData = (id?: string | null): DocumentData | null => {
      if (!id) return null;
      const d = allDocs.find((doc) => doc.id === id);
      if (!d) return null;

      // Check ownership
      if (!checkDocumentOwnership(auth.user!, d)) {
        throw new Error(`FORBIDDEN_DOC_${id}`);
      }

      const fieldsMap: Record<string, import('@/lib/types').ExtractedField> = {};
      allFields
        .filter((f) => f.document_id === id)
        .forEach((f) => {
          fieldsMap[f.field_name] = f;
        });
      const lines = allLineItems.filter((li) => li.document_id === id);
      return {
        id: d.id,
        category: d.category,
        fields: fieldsMap,
        lineItems: lines,
      };
    };

    let contractDoc: DocumentData | null = null;
    let poDoc: DocumentData | null = null;
    let invoiceDoc: DocumentData | null = null;

    try {
      contractDoc = buildDocData(contractId);
      poDoc = buildDocData(purchaseOrderId);
      invoiceDoc = buildDocData(invoiceId);
    } catch (authErr: unknown) {
      const msg = (authErr as Error)?.message || '';
      if (typeof msg === 'string' && msg.startsWith('FORBIDDEN_DOC_')) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You do not have permission to reconcile one or more of the specified documents' },
          { status: 403 }
        );
      }
      throw authErr;
    }

    // If specific IDs were not provided, auto-detect matchable documents owned by user
    if (!contractDoc && !poDoc && !invoiceDoc) {
      const userAccessibleDocs = allDocs.filter((d) => checkDocumentOwnership(auth.user!, d));
      const invoices = userAccessibleDocs.filter((d) => d.category === 'invoice');
      const pos = userAccessibleDocs.filter((d) => d.category === 'purchase_order');
      const contracts = userAccessibleDocs.filter((d) => d.category === 'contract');

      if (invoices.length > 0) invoiceDoc = buildDocData(invoices[0].id);
      if (pos.length > 0) poDoc = buildDocData(pos[0].id);
      if (contracts.length > 0) contractDoc = buildDocData(contracts[0].id);
    }

    if (!contractDoc && !poDoc && !invoiceDoc) {
      return NextResponse.json(
        { success: false, error: 'No documents available to reconcile. Upload at least an invoice or purchase order.' },
        { status: 400 }
      );
    }

    const groupId = `rec-grp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
    const nowIso = new Date().toISOString();

    const reconResult = reconcileDocuments(contractDoc, poDoc, invoiceDoc, groupId);

    const newGroup: ReconciliationGroup = {
      id: groupId,
      user_id: auth.user.id,
      name: groupName || `${reconResult.vendorName || 'Vendor'} Reconciliation`,
      contract_id: contractDoc?.id ?? null,
      purchase_order_id: poDoc?.id ?? null,
      invoice_id: invoiceDoc?.id ?? null,
      status: reconResult.status,
      contract_value: reconResult.contractValue,
      po_value: reconResult.poValue,
      invoice_value: reconResult.invoiceValue,
      variance: reconResult.variance,
      variance_percentage: reconResult.variancePercentage,
      currency: reconResult.currency,
      vendor_name: reconResult.vendorName,
      reconciled_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    await ServerPersistence.saveReconciliationGroup(newGroup);

    // Check for duplicate invoices across all processed invoices
    if (invoiceDoc) {
      const otherInvoices = allDocs
        .filter((d) => d.category === 'invoice' && d.id !== invoiceDoc!.id)
        .map((d) => {
          const invFields = allFields.filter((f) => f.document_id === d.id);
          const getF = (n: string) => invFields.find((f) => f.field_name === n)?.field_value ?? null;
          const getNum = (n: string) => {
            const v = getF(n);
            if (!v) return null;
            const c = parseFloat(v.replace(/[^0-9.-]/g, ''));
            return isNaN(c) ? null : c;
          };
          return {
            id: d.id,
            number: getF('invoice_number') || '',
            supplier: getF('supplier_name') || '',
            total: getNum('total'),
            date: getF('invoice_date') || '',
          };
        });

      const currentCandidate = {
        id: invoiceDoc.id,
        number: invoiceDoc.fields['invoice_number']?.field_value ?? null,
        supplier: invoiceDoc.fields['supplier_name']?.field_value ?? null,
        total: invoiceDoc.fields['total']?.field_value
          ? parseFloat(invoiceDoc.fields['total']?.field_value.replace(/[^0-9.-]/g, ''))
          : null,
        date: invoiceDoc.fields['invoice_date']?.field_value ?? null,
      };

      const dupFinding = checkDuplicateInvoice(currentCandidate, otherInvoices, invoiceDoc.id);
      if (dupFinding) {
        reconResult.findings.push(dupFinding);
        reconResult.status = 'discrepancy';
        newGroup.status = 'discrepancy';
      }
    }

    // Save newly created or updated findings with authenticated user ID
    const newFindings: Finding[] = reconResult.findings.map((f, i) => ({
      ...f,
      id: `F-${Date.now().toString().slice(-4)}-${i + 1}`,
      user_id: auth.user!.id,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    if (newFindings.length > 0) {
      await ServerPersistence.saveFindings(newFindings);
    }

    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Reconciliation Executed',
      entity_type: 'reconciliation',
      entity_id: groupId,
      entity_title: newGroup.name || 'Reconciliation Group',
      details: `Reconciled ${[contractDoc?.id, poDoc?.id, invoiceDoc?.id].filter(Boolean).length} documents. Status: ${reconResult.status.toUpperCase()}. Generated ${newFindings.length} findings.`,
    });

    return NextResponse.json({
      success: true,
      data: {
        group: newGroup,
        result: reconResult,
        findings: newFindings,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Reconciliation execution failed' },
      { status: 500 }
    );
  }
}
