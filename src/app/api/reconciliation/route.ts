import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { reconcileDocuments, type DocumentData } from '@/lib/reconciliation/engine';
import type { ReconciliationGroup, Finding } from '@/lib/types';


export async function GET() {
  try {
    const groups = await ServerPersistence.getReconciliationGroups();
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
    const body = await req.json().catch(() => ({}));
    const { contractId, purchaseOrderId, invoiceId, groupName } = body;

    const allDocs = await ServerPersistence.getDocuments();
    const allFields = await ServerPersistence.getExtractedFields();
    const allLineItems = await ServerPersistence.getLineItems();

    const buildDocData = (id?: string | null): DocumentData | null => {
      if (!id) return null;
      const d = allDocs.find((doc) => doc.id === id);
      if (!d) return null;
      const fieldsMap: Record<string, any> = {};
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

    let contractDoc = buildDocData(contractId);
    let poDoc = buildDocData(purchaseOrderId);
    let invoiceDoc = buildDocData(invoiceId);

    // If specific IDs were not provided, auto-detect matchable documents
    if (!contractDoc && !poDoc && !invoiceDoc) {
      const invoices = allDocs.filter((d) => d.category === 'invoice');
      const pos = allDocs.filter((d) => d.category === 'purchase_order');
      const contracts = allDocs.filter((d) => d.category === 'contract');

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
      user_id: 'usr-demo-admin-001',
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

    // Save newly created findings
    const newFindings: Finding[] = reconResult.findings.map((f, i) => ({
      ...f,
      id: `F-${Date.now().toString().slice(-4)}-${i + 1}`,
      user_id: 'usr-demo-admin-001',
      created_at: nowIso,
      updated_at: nowIso,
    }));

    if (newFindings.length > 0) {
      await ServerPersistence.saveFindings(newFindings);
    }

    await ServerPersistence.addAuditEvent({
      user_name: 'Gurumoorthy S',
      user_email: 'gurumoorthy@docusentinel.ai',
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
