// ============================================================
// DocuSentinel AI — Indian Fiscal Compliance Engine (GST & HSN)
// Deterministic rules for GSTIN format, Luhn-mod-36 checksum,
// intra-state (CGST+SGST) vs inter-state (IGST) tax type consistency,
// official GST tax slabs, and HSN/SAC codes.
// ============================================================

export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh (New)',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const BASE36_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calculates the official 15th checksum character of a 14-character GSTIN prefix
 * using the GSTN Luhn-mod-36 algorithm.
 */
export function calculateGstinChecksum(gstin14: string): string {
  if (!gstin14 || gstin14.length < 14) {
    throw new Error('GSTIN prefix must be at least 14 characters');
  }
  const clean14 = gstin14.slice(0, 14).toUpperCase();
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = BASE36_CHARS.indexOf(clean14[i]);
    if (codePoint === -1) {
      throw new Error(`Invalid character in GSTIN prefix: ${clean14[i]}`);
    }
    const multiplier = (i % 2 === 0) ? 1 : 2;
    const product = codePoint * multiplier;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return BASE36_CHARS[checkCodePoint];
}

/**
 * Validates the 15th character checksum of a GSTIN using Luhn-mod-36.
 */
export function validateGstinChecksum(gstin: string): boolean {
  if (!gstin || typeof gstin !== 'string') return false;
  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) return false;
  try {
    const expectedCheck = calculateGstinChecksum(clean.slice(0, 14));
    return clean[14] === expectedCheck;
  } catch {
    return false;
  }
}

export interface GstinValidationResult {
  isValid: boolean;
  gstin: string;
  error?: string;
  errorType?: 'INVALID_FORMAT' | 'CHECKSUM_FAILURE' | 'INVALID_STATE' | 'EMPTY';
  stateCode?: string;
  stateName?: string;
  pan?: string;
}

/**
 * Performs full validation on a GSTIN: length, regex format, state code, and Luhn-mod-36 checksum.
 */
export function validateGstin(gstin: string | null | undefined): GstinValidationResult {
  if (!gstin || typeof gstin !== 'string') {
    return { isValid: false, gstin: '', error: 'GSTIN is empty or not provided', errorType: 'EMPTY' };
  }
  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return {
      isValid: false,
      gstin: clean,
      errorType: 'INVALID_FORMAT',
      error: `GSTIN must be exactly 15 characters (received ${clean.length} characters: "${clean}")`,
    };
  }

  if (!GSTIN_REGEX.test(clean)) {
    return {
      isValid: false,
      gstin: clean,
      errorType: 'INVALID_FORMAT',
      error: `GSTIN "${clean}" does not match required format (2-digit state + 10-char PAN + entity code + 'Z' + check-digit)`,
    };
  }

  const stateCode = clean.slice(0, 2);
  const stateName = INDIAN_STATES[stateCode];
  if (!stateName) {
    return {
      isValid: false,
      gstin: clean,
      stateCode,
      errorType: 'INVALID_STATE',
      error: `State code "${stateCode}" in GSTIN is not a recognized Indian state or union territory code`,
    };
  }

  const pan = clean.slice(2, 12);
  const isValidChecksum = validateGstinChecksum(clean);
  if (!isValidChecksum) {
    const expectedCheck = calculateGstinChecksum(clean.slice(0, 14));
    return {
      isValid: false,
      gstin: clean,
      stateCode,
      stateName,
      pan,
      errorType: 'CHECKSUM_FAILURE',
      error: `GSTIN "${clean}" failed Luhn-mod-36 checksum verification (expected "${expectedCheck}", found "${clean[14]}")`,
    };
  }

  return {
    isValid: true,
    gstin: clean,
    stateCode,
    stateName,
    pan,
  };
}

// Official Indian GST tax rate slabs in percentage
export const VALID_GST_SLABS = [0, 0.25, 3, 5, 12, 18, 28];

/**
 * Validates whether an effective tax rate matches one of the statutory GST slabs.
 */
export function validateGstRateSlab(
  ratePercent: number,
  tolerancePercent: number = 0.5
): { isValid: boolean; matchedSlab?: number } {
  for (const slab of VALID_GST_SLABS) {
    if (Math.abs(ratePercent - slab) <= tolerancePercent) {
      return { isValid: true, matchedSlab: slab };
    }
  }
  return { isValid: false };
}

export interface GstTaxTypeResult {
  isConsistent: boolean;
  supplyType: 'intra_state' | 'inter_state' | 'unknown';
  error?: string;
  sellerState?: string;
  buyerState?: string;
}

/**
 * Validates tax types according to Indian GST law:
 * - Intra-state (Supplier State == Buyer State): CGST + SGST required (where CGST == SGST). IGST must not be charged.
 * - Inter-state (Supplier State != Buyer State): IGST required. CGST/SGST must not be charged.
 */
export function validateGstTaxType(
  supplierGstin: string | null | undefined,
  buyerGstin: string | null | undefined,
  cgst: number | null | undefined,
  sgst: number | null | undefined,
  igst: number | null | undefined
): GstTaxTypeResult {
  const suppVal = validateGstin(supplierGstin);
  const buyVal = validateGstin(buyerGstin);

  if (!suppVal.isValid || !buyVal.isValid || !suppVal.stateCode || !buyVal.stateCode) {
    return {
      isConsistent: true, // Cannot reliably determine supply type without both valid state codes
      supplyType: 'unknown',
    };
  }

  const isIntraState = suppVal.stateCode === buyVal.stateCode;
  const supplyType = isIntraState ? 'intra_state' : 'inter_state';

  const cgstVal = cgst ?? 0;
  const sgstVal = sgst ?? 0;
  const igstVal = igst ?? 0;

  if (isIntraState) {
    // Both supplier and buyer are in the same state: Must charge CGST + SGST, NOT IGST
    if (igstVal > 0.05) {
      return {
        isConsistent: false,
        supplyType,
        sellerState: suppVal.stateName,
        buyerState: buyVal.stateName,
        error: `Intra-state supply within ${suppVal.stateName} (State code ${suppVal.stateCode}) incorrectly charged IGST (${igstVal.toFixed(2)}). Under GST law, intra-state transactions must charge equal CGST + SGST.`,
      };
    }
    // CGST and SGST must be equal (within 0.05 rounding tolerance)
    if ((cgstVal > 0 || sgstVal > 0) && Math.abs(cgstVal - sgstVal) > 0.05) {
      return {
        isConsistent: false,
        supplyType,
        sellerState: suppVal.stateName,
        buyerState: buyVal.stateName,
        error: `Intra-state CGST (${cgstVal.toFixed(2)}) and SGST (${sgstVal.toFixed(2)}) amounts must be equal for supplies in ${suppVal.stateName}.`,
      };
    }
  } else {
    // Different states: Must charge IGST, NOT CGST or SGST
    if (cgstVal > 0.05 || sgstVal > 0.05) {
      return {
        isConsistent: false,
        supplyType,
        sellerState: suppVal.stateName,
        buyerState: buyVal.stateName,
        error: `Inter-state supply from ${suppVal.stateName} (${suppVal.stateCode}) to ${buyVal.stateName} (${buyVal.stateCode}) incorrectly charged CGST (${cgstVal.toFixed(2)}) / SGST (${sgstVal.toFixed(2)}). Inter-state supplies must charge IGST.`,
      };
    }
  }

  return {
    isConsistent: true,
    supplyType,
    sellerState: suppVal.stateName,
    buyerState: buyVal.stateName,
  };
}

/**
 * Determines whether a line item or text contains a valid HSN (4, 6, 8 digits) or SAC code.
 */
export function hasHsnSacCode(text: string | null | undefined): boolean {
  if (!text) return false;
  // Matches HSN or SAC followed by 4, 6, or 8 digits, or standalone 6 or 8 digits
  const hsnPattern = /\b(?:hsn|sac)(?:\s*(?:code|no|#)?)?\s*[:\-]?\s*([0-9]{4,8})\b/i;
  const sacPrefixPattern = /\b99[0-9]{4}\b/; // SAC codes start with 99
  const standaloneHsnPattern = /\b(?:hsn[:\s]*)?([0-9]{6,8})\b/i;

  return hsnPattern.test(text) || sacPrefixPattern.test(text) || standaloneHsnPattern.test(text);
}
