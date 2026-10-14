import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { isNvidiaConfigured, compareDocumentsWithNvidia } from '@/lib/ai/nvidia';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { contractId, purchaseOrderId, invoiceId } = body;

    const allDocs = await ServerPersistence.getDocuments();
    const allFields = await ServerPersistence.getExtractedFields();

    const getDocFieldsMap = (docId?: string) => {
      if (!docId) return {};
      const fields = allFields.filter((f) => f.document_id === docId);
      const map: Record<string, string | null> = {};
      fields.forEach((f) => {
        map[f.field_name] = f.field_value;
      });
      return map;
    };

    // Auto-detect documents if not explicitly specified
    let cId = contractId;
    let pId = purchaseOrderId;
    let iId = invoiceId;

    if (!cId && !pId && !iId) {
      const inv = allDocs.find((d) => d.category === 'invoice');
      const po = allDocs.find((d) => d.category === 'purchase_order');
      const cnt = allDocs.find((d) => d.category === 'contract');
      if (inv) iId = inv.id;
      if (po) pId = po.id;
      if (cnt) cId = cnt.id;
    }

    const contractDoc = allDocs.find((d) => d.id === cId);
    const poDoc = allDocs.find((d) => d.id === pId);
    const invoiceDoc = allDocs.find((d) => d.id === iId);

    if (!contractDoc && !poDoc && !invoiceDoc) {
      return NextResponse.json(
        { success: false, error: 'No documents provided or found to compare.' },
        { status: 400 }
      );
    }

    const payload = {
      contract: {
        fields: getDocFieldsMap(contractDoc?.id),
      },
      purchaseOrder: {
        fields: getDocFieldsMap(poDoc?.id),
      },
      invoice: {
        fields: getDocFieldsMap(invoiceDoc?.id),
      },
    };

    let comparisonResult;
    if (isNvidiaConfigured()) {
      comparisonResult = await compareDocumentsWithNvidia(payload);
    } else {
      // Deterministic field alignment comparison
      const observations: Array<{
        field: string;
        contractValue: string | null;
        poValue: string | null;
        invoiceValue: string | null;
        observation: string;
        risk: 'none' | 'low' | 'medium' | 'high';
      }> = [];

      const fieldsToCheck = [
        'supplier_name',
        'currency',
        'total',
        'contract_value',
        'payment_terms',
      ];

      for (const field of fieldsToCheck) {
        const cVal = payload.contract.fields[field] || payload.contract.fields['contract_value'] || null;
        const pVal = payload.purchaseOrder.fields[field] || null;
        const iVal = payload.invoice.fields[field] || null;

        if (cVal || pVal || iVal) {
          observations.push({
            field,
            contractValue: cVal,
            poValue: pVal,
            invoiceValue: iVal,
            observation:
              pVal && iVal && pVal !== iVal
                ? `Value variance detected between PO (${pVal}) and Invoice (${iVal}).`
                : 'Values are consistent across document set.',
            risk: pVal && iVal && pVal !== iVal ? 'medium' : 'none',
          });
        }
      }

      comparisonResult = {
        summary: `Document comparison across ${[contractDoc?.file_name, poDoc?.file_name, invoiceDoc?.file_name].filter(Boolean).join(', ')}.`,
        fieldObservations: observations,
        overallAssessment: 'Deterministic field alignment completed.',
        isAiGenerated: false,
        modelUsed: 'deterministic-comparator',
      };
    }

    return NextResponse.json({
      success: true,
      data: comparisonResult,
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Cross-document comparison failed';
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
