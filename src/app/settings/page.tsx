'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/layout/AppShell';
import {
  Sliders,
  ShieldCheck,
  Percent,
  DollarSign,
  Scale,
  Save,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Building2,
  FileCheck2,
  HelpCircle,
} from 'lucide-react';
import type { OrganizationConfig } from '@/lib/types';

interface RuleDefinition {
  id: string;
  category: '3way' | '4way' | 'cumulative' | 'tax' | 'terms';
  name: string;
  description: string;
  defaultSeverity: 'critical' | 'high' | 'medium';
}

const AVAILABLE_RULES: RuleDefinition[] = [
  // 3-Way Core Math
  {
    id: 'RULE_UNIT_PRICE_MISMATCH',
    category: '3way',
    name: 'Line Item Unit Price Mismatch',
    description: 'Flags invoices billing higher unit rates than authorized in the Purchase Order.',
    defaultSeverity: 'high',
  },
  {
    id: 'RULE_LINE_ITEM_QTY_MISMATCH',
    category: '3way',
    name: 'Line Item Quantity Discrepancy',
    description: 'Flags invoiced quantities that exceed authorized PO quantities.',
    defaultSeverity: 'high',
  },
  {
    id: 'RULE_TAX_CALCULATION_MISMATCH',
    category: '3way',
    name: 'Tax & Subtotal Arithmetic Discrepancy',
    description: 'Validates line items sum strictly to subtotal, and tax rates calculate exact total.',
    defaultSeverity: 'high',
  },
  {
    id: 'RULE_DUPLICATE_INVOICE',
    category: '3way',
    name: 'Duplicate Invoice Detection',
    description: 'Prevents double-payment by detecting duplicate invoice numbers and supplier-amount collisions.',
    defaultSeverity: 'critical',
  },
  // 4-Way GRN
  {
    id: 'RULE_GRN_QUANTITY_MISMATCH',
    category: '4way',
    name: 'GRN Received vs Billed Discrepancy',
    description: 'Four-way match: compares warehouse receipt physical count against invoiced quantity.',
    defaultSeverity: 'high',
  },
  {
    id: 'RULE_GRN_DAMAGE_REJECTED',
    category: '4way',
    name: 'Damaged / Rejected Goods Billed',
    description: 'Identifies goods rejected during physical inspection that remain billed on the invoice.',
    defaultSeverity: 'critical',
  },
  {
    id: 'RULE_GRN_MISSING',
    category: '4way',
    name: 'Mandatory Warehouse Receipt Missing',
    description: 'Blocks payment release until warehouse confirms receipt of physical deliverables.',
    defaultSeverity: 'medium',
  },
  // Cumulative PO & Contract
  {
    id: 'RULE_PO_CUMULATIVE_BILLED_EXCEEDED',
    category: 'cumulative',
    name: 'Cumulative PO Ceiling Exceeded',
    description: 'Tracks multiple partial invoices to prevent cumulative billing from piercing authorized PO cap.',
    defaultSeverity: 'critical',
  },
  {
    id: 'RULE_CONTRACT_CUMULATIVE_BILLED_EXCEEDED',
    category: 'cumulative',
    name: 'Contract Value Cap Exceeded',
    description: 'Verifies all invoices billed under a Master Services Agreement stay within financial ceiling.',
    defaultSeverity: 'critical',
  },
  // India Statutory GST
  {
    id: 'RULE_GSTIN_CHECKSUM_FAILURE',
    category: 'tax',
    name: 'GSTIN Luhn-Mod-36 Checksum Validation',
    description: 'Verifies official GSTN 15th checksum character algorithm against counterfeit / typo GSTINs.',
    defaultSeverity: 'critical',
  },
  {
    id: 'RULE_GST_TYPE_INCONSISTENT',
    category: 'tax',
    name: 'Intra- vs Inter-State Tax Consistency',
    description: 'Enforces CGST+SGST on same-state supplies and IGST on cross-state interstate transactions.',
    defaultSeverity: 'high',
  },
  {
    id: 'RULE_GST_RATE_UNUSUAL',
    category: 'tax',
    name: 'Statutory GST Rate Slabs Check',
    description: 'Flags unusual tax percentages deviating from official GST council slabs (0%, 5%, 12%, 18%, 28%).',
    defaultSeverity: 'medium',
  },
  {
    id: 'RULE_HSN_CODE_MISSING',
    category: 'tax',
    name: 'Mandatory HSN / SAC Code Verification',
    description: 'Verifies presence of 4 to 8 digit HSN/SAC codes for statutory GST compliance.',
    defaultSeverity: 'medium',
  },
  // Terms & Commercial
  {
    id: 'RULE_CONFLICTING_PAYMENT_TERMS',
    category: 'terms',
    name: 'Accelerated Cash Outflow Penalty',
    description: 'Calculates working capital financial cost when invoices demand earlier payment than agreed contract.',
    defaultSeverity: 'medium',
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'tolerances' | 'rules' | 'fiscal'>('tolerances');
  const [config, setConfig] = useState<OrganizationConfig>({
    organization_id: 'default_org',
    price_tolerance_pct: 0.0,
    amount_tolerance_abs: 0.0,
    qty_tolerance_pct: 0.0,
    cost_of_capital_annual_rate: 0.12,
    require_grn: false,
    enabled_rules: [],
    enforce_gstin_checksum: true,
    buyer_gstin: '',
    buyer_state_code: '',
    currency_default: 'USD',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setConfig(json.data);
        }
      })
      .catch((err) => {
        console.error('Failed to load settings:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setConfig(json.data);
        setStatusMessage({
          type: 'success',
          text: 'Enterprise tolerances and compliance rules successfully saved and logged to audit chain.',
        });
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({
          type: 'error',
          text: json.error || 'Failed to save configuration settings.',
        });
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Network error saving settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = (ruleId: string) => {
    const current = config.enabled_rules || [];
    // If empty, it means all rules are currently active. If user toggles one off, enable the rest
    if (current.length === 0) {
      const allExceptThis = AVAILABLE_RULES.map((r) => r.id).filter((id) => id !== ruleId);
      setConfig({ ...config, enabled_rules: allExceptThis });
      return;
    }

    if (current.includes(ruleId)) {
      setConfig({
        ...config,
        enabled_rules: current.filter((id) => id !== ruleId),
      });
    } else {
      const updated = [...current, ruleId];
      // If now all rules are selected, we can simplify to empty array (meaning all active)
      if (updated.length === AVAILABLE_RULES.length) {
        setConfig({ ...config, enabled_rules: [] });
      } else {
        setConfig({ ...config, enabled_rules: updated });
      }
    }
  };

  const isRuleActive = (ruleId: string) => {
    if (!config.enabled_rules || config.enabled_rules.length === 0) return true;
    return config.enabled_rules.includes(ruleId);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all tolerances and active rules to strict enterprise defaults?')) {
      setConfig({
        organization_id: config.organization_id || 'default_org',
        price_tolerance_pct: 0.0,
        amount_tolerance_abs: 0.0,
        qty_tolerance_pct: 0.0,
        cost_of_capital_annual_rate: 0.12,
        require_grn: false,
        enabled_rules: [],
        enforce_gstin_checksum: true,
        buyer_gstin: '',
        buyer_state_code: '',
        currency_default: 'USD',
      });
    }
  };

  return (
    <AppShell>
      <div className="page-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Enterprise Reconciliation Settings</h1>
          <p className="page-subtitle">
            Configure algorithmic variance thresholds, 4-way matching policies, statutory tax rules, and audit parameters.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleResetDefaults}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={16} />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Save size={16} />
            <span>{saving ? 'Saving Changes...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            backgroundColor: statusMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${statusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{statusMessage.text}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-color)', marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('tolerances')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tolerances' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'tolerances' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'tolerances' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Sliders size={18} />
          <span>Variance Tolerances</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'rules' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'rules' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'rules' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ShieldCheck size={18} />
          <span>Active Rules & Checks ({AVAILABLE_RULES.filter((r) => isRuleActive(r.id)).length}/{AVAILABLE_RULES.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('fiscal')}
          style={{
            padding: '10px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'fiscal' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'fiscal' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'fiscal' ? 600 : 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Building2 size={18} />
          <span>Fiscal & Tax Parameters</span>
        </button>
      </div>

      {/* Tab 1: Tolerances */}
      {activeTab === 'tolerances' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* Card: Price Tolerance */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Percent size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Price Variance Tolerance (%)</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Permissible unit price deviation before generating discrepancy findings.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={config.price_tolerance_pct}
                  onChange={(e) => setConfig({ ...config, price_tolerance_pct: parseFloat(e.target.value) || 0 })}
                  className="form-control"
                  style={{ width: 120, fontSize: '1.1rem', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>% allowable price difference</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Example: Setting 1.5% permits ₹100 PO item to bill up to ₹101.50 without triggering a price mismatch flag.
              </p>
            </div>
          </div>

          {/* Card: Absolute Amount Tolerance */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <DollarSign size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Absolute Amount Tolerance</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sub-total rounding buffer for currency conversion and cent rounding.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="1000"
                  value={config.amount_tolerance_abs}
                  onChange={(e) => setConfig({ ...config, amount_tolerance_abs: parseFloat(e.target.value) || 0 })}
                  className="form-control"
                  style={{ width: 120, fontSize: '1.1rem', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{config.currency_default || 'USD'} buffer</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Suppresses negligible rounding discrepancies under this threshold from halting straight-through processing.
              </p>
            </div>
          </div>

          {/* Card: Quantity Tolerance */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Scale size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Quantity Variance Tolerance (%)</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Acceptable over-delivery / split shipment allowance.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={config.qty_tolerance_pct}
                  onChange={(e) => setConfig({ ...config, qty_tolerance_pct: parseFloat(e.target.value) || 0 })}
                  className="form-control"
                  style={{ width: 120, fontSize: '1.1rem', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>% allowable quantity deviation</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Typically set to 0.0% for discrete manufactured goods; 1-3% for bulk raw materials.
              </p>
            </div>
          </div>

          {/* Card: Cost of Capital */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 10, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <Building2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Cost of Capital Annual Rate</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Financing benchmark used to calculate cash outflow impact on accelerated payment terms.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.5"
                  value={config.cost_of_capital_annual_rate}
                  onChange={(e) => setConfig({ ...config, cost_of_capital_annual_rate: parseFloat(e.target.value) || 0.12 })}
                  className="form-control"
                  style={{ width: 120, fontSize: '1.1rem', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  ({(config.cost_of_capital_annual_rate * 100).toFixed(1)}% p.a.)
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Used in `RULE_CONFLICTING_PAYMENT_TERMS` to measure loss of interest or financing cost of paying early.
              </p>
            </div>
          </div>

          {/* Card: 4-Way Matching Policy */}
          <div className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileCheck2 size={20} style={{ color: '#0ea5e9' }} />
                  <span>Mandatory Four-Way Matching Policy (GRN Required)</span>
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  When enabled, any invoice submitted without an accompanying Goods Receipt Note is automatically flagged with `RULE_GRN_MISSING`.
                </p>
              </div>
              <div>
                <label className="switch" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.require_grn}
                    onChange={(e) => setConfig({ ...config, require_grn: e.target.checked })}
                    style={{ width: 20, height: 20, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {config.require_grn ? 'Enforced' : 'Optional'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Active Rules */}
      {activeTab === 'rules' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Enable or disable specific reconciliation rules. Disabled rules will be bypassed during reconciliation execution.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfig({ ...config, enabled_rules: [] })}
                className="btn btn-secondary btn-sm"
              >
                Enable All ({AVAILABLE_RULES.length})
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {AVAILABLE_RULES.map((rule) => {
              const active = isRuleActive(rule.id);
              return (
                <div
                  key={rule.id}
                  className="card"
                  style={{
                    padding: '14px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderLeft: `4px solid ${
                      active
                        ? rule.defaultSeverity === 'critical'
                          ? '#ef4444'
                          : rule.defaultSeverity === 'high'
                          ? '#f97316'
                          : '#3b82f6'
                        : 'var(--border-color)'
                    }`,
                    opacity: active ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{rule.name}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontFamily: 'monospace',
                          padding: '2px 6px',
                          borderRadius: 4,
                          backgroundColor: 'rgba(0,0,0,0.06)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {rule.id}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          backgroundColor:
                            rule.defaultSeverity === 'critical'
                              ? 'rgba(239, 68, 68, 0.1)'
                              : rule.defaultSeverity === 'high'
                              ? 'rgba(249, 115, 22, 0.1)'
                              : 'rgba(59, 130, 246, 0.1)',
                          color:
                            rule.defaultSeverity === 'critical'
                              ? '#dc2626'
                              : rule.defaultSeverity === 'high'
                              ? '#ea580c'
                              : '#2563eb',
                        }}
                      >
                        {rule.defaultSeverity}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {rule.description}
                    </p>
                  </div>

                  <div style={{ marginLeft: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleRule(rule.id)}
                        style={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: active ? 'var(--text-main)' : 'var(--text-muted)' }}>
                        {active ? 'Active' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Fiscal Profile */}
      {activeTab === 'fiscal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 600 }}>Default Accounting Currency</h3>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Primary Operating Currency
              </label>
              <select
                value={config.currency_default || 'USD'}
                onChange={(e) => setConfig({ ...config, currency_default: e.target.value })}
                className="form-control"
                style={{ width: '100%', maxWidth: 240 }}
              >
                <option value="USD">USD ($) — United States Dollar</option>
                <option value="INR">INR (₹) — Indian Rupee</option>
                <option value="EUR">EUR (€) — Euro</option>
                <option value="GBP">GBP (£) — British Pound</option>
              </select>
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 600 }}>Statutory India GST Settings</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={config.enforce_gstin_checksum !== false}
                  onChange={(e) => setConfig({ ...config, enforce_gstin_checksum: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  Enforce GSTN Luhn-Mod-36 Checksum Verification
                </span>
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Validates the 15th alphanumeric check digit on supplier and buyer tax IDs.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Buyer / Organization GSTIN (Optional)
              </label>
              <input
                type="text"
                maxLength={15}
                placeholder="e.g. 27AAPFU0939F1ZV"
                value={config.buyer_gstin || ''}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  const state = val.length >= 2 ? val.slice(0, 2) : config.buyer_state_code;
                  setConfig({ ...config, buyer_gstin: val, buyer_state_code: state });
                }}
                className="form-control"
                style={{ width: '100%', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Used to determine intra-state (CGST+SGST) vs inter-state (IGST) tax type consistency.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Buyer Home State Code (2-digit GST state prefix)
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="27"
                value={config.buyer_state_code || ''}
                onChange={(e) => setConfig({ ...config, buyer_state_code: e.target.value })}
                className="form-control"
                style={{ width: 80, fontFamily: 'monospace' }}
              />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
