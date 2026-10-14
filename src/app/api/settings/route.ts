import { NextRequest, NextResponse } from 'next/server';
import { ServerPersistence } from '@/lib/server/persistence';
import { authenticateRequest } from '@/lib/server/auth';
import type { OrganizationConfig } from '@/lib/types';

const DEFAULT_CONFIG: OrganizationConfig = {
  org_id: 'default_org',
  organization_id: 'default_org',
  price_tolerance_pct: 0.0,
  price_tolerance_percentage: 0.0,
  amount_tolerance_abs: 0.0,
  amount_tolerance_absolute: 0.0,
  qty_tolerance_pct: 0.0,
  quantity_tolerance_percentage: 0.0,
  cost_of_capital_annual_rate: 0.12,
  annual_cost_of_capital_rate: 0.12,
  require_grn: false,
  require_four_way_matching: false,
  enabled_rules: [],
  enforce_gstin_checksum: true,
  buyer_gstin: '',
  buyer_state_code: '',
  currency_default: 'USD',
};

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized: Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const orgId = auth.user.organization_id || 'default_org';
    const config = await ServerPersistence.getOrgConfig(orgId);

    return NextResponse.json({
      success: true,
      data: config || { ...DEFAULT_CONFIG, organization_id: orgId },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to fetch settings' },
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
    const orgId = auth.user.organization_id || 'default_org';
    const existing = (await ServerPersistence.getOrgConfig(orgId)) || { ...DEFAULT_CONFIG, organization_id: orgId };

    const priceTol = typeof body.price_tolerance_pct === 'number' ? Math.max(0, body.price_tolerance_pct) : existing.price_tolerance_pct;
    const amountTol = typeof body.amount_tolerance_abs === 'number' ? Math.max(0, body.amount_tolerance_abs) : existing.amount_tolerance_abs;
    const qtyTol = typeof body.qty_tolerance_pct === 'number' ? Math.max(0, body.qty_tolerance_pct) : existing.qty_tolerance_pct;
    const costOfCap = typeof body.cost_of_capital_annual_rate === 'number' ? Math.max(0, body.cost_of_capital_annual_rate) : existing.cost_of_capital_annual_rate;
    const reqGrn = typeof body.require_grn === 'boolean' ? body.require_grn : existing.require_grn;
    const enforceGstin = typeof body.enforce_gstin_checksum === 'boolean' ? body.enforce_gstin_checksum : existing.enforce_gstin_checksum;
    const enabledRules = Array.isArray(body.enabled_rules) ? body.enabled_rules.map(String) : existing.enabled_rules;
    const buyerGstin = typeof body.buyer_gstin === 'string' ? body.buyer_gstin.trim() : existing.buyer_gstin;
    const buyerState = typeof body.buyer_state_code === 'string' ? body.buyer_state_code.trim() : existing.buyer_state_code;
    const currDefault = typeof body.currency_default === 'string' ? body.currency_default.trim() : existing.currency_default;

    const updatedConfig: OrganizationConfig = {
      org_id: orgId,
      organization_id: orgId,
      price_tolerance_pct: priceTol,
      price_tolerance_percentage: priceTol,
      amount_tolerance_abs: amountTol,
      amount_tolerance_absolute: amountTol,
      qty_tolerance_pct: qtyTol,
      quantity_tolerance_percentage: qtyTol,
      cost_of_capital_annual_rate: costOfCap,
      annual_cost_of_capital_rate: costOfCap,
      require_grn: reqGrn,
      require_four_way_matching: reqGrn,
      enabled_rules: enabledRules,
      enforce_gstin_checksum: enforceGstin,
      buyer_gstin: buyerGstin,
      buyer_state_code: buyerState,
      currency_default: currDefault,
      updated_at: new Date().toISOString(),
    };

    const saved = await ServerPersistence.saveOrgConfig(updatedConfig);

    await ServerPersistence.addAuditEvent({
      user_name: auth.user.name,
      user_email: auth.user.email,
      action: 'Organization Settings Updated',
      entity_type: 'settings',
      entity_id: orgId,
      entity_title: `Org Config: ${orgId}`,
      details: `Updated tolerances (Price: ${priceTol}%, Abs: ${amountTol}, Qty: ${qtyTol}%, Rules: ${enabledRules.length > 0 ? enabledRules.join(', ') : 'All Active'}).`,
    });

    return NextResponse.json({
      success: true,
      data: saved,
      message: 'Organization reconciliation settings saved successfully.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
