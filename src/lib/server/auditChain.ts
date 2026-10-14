import crypto from 'crypto';
import type { AuditEvent } from '@/lib/types';

export const GENESIS_PREV_HASH = 'GENESIS';

export interface CanonicalAuditPayload {
  action: string;
  created_at: string;
  details: string;
  entity_id: string;
  entity_title: string;
  entity_type: string;
  id: string;
  user_email: string;
  user_name: string;
}

/**
 * Creates a deterministic, sorted-key string representation of an audit event.
 */
export function canonicalizeAuditEvent(
  event: Pick<
    AuditEvent,
    | 'id'
    | 'action'
    | 'entity_type'
    | 'entity_id'
    | 'entity_title'
    | 'details'
    | 'user_name'
    | 'user_email'
    | 'created_at'
  >
): string {
  const detailsStr =
    typeof event.details === 'object' && event.details !== null
      ? JSON.stringify(event.details)
      : String(event.details || '');

  const canonical: CanonicalAuditPayload = {
    action: String(event.action || ''),
    created_at: String(event.created_at || ''),
    details: detailsStr,
    entity_id: String(event.entity_id || ''),
    entity_title: String(event.entity_title || ''),
    entity_type: String(event.entity_type || ''),
    id: String(event.id || ''),
    user_email: String(event.user_email || ''),
    user_name: String(event.user_name || ''),
  };

  // Stringify with sorted keys guaranteed
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Calculates SHA-256 hash for an audit event chained to `prevHash`.
 */
export function calculateEventHash(
  prevHash: string | null | undefined,
  event: Pick<
    AuditEvent,
    | 'id'
    | 'action'
    | 'entity_type'
    | 'entity_id'
    | 'entity_title'
    | 'details'
    | 'user_name'
    | 'user_email'
    | 'created_at'
  >
): string {
  const effectivePrev = prevHash || GENESIS_PREV_HASH;
  const canonicalJson = canonicalizeAuditEvent(event);
  return crypto
    .createHash('sha256')
    .update(`${effectivePrev}:${canonicalJson}`)
    .digest('hex');
}

/**
 * Links and hashes a newly created audit event to the previous head hash.
 */
export function signAuditEvent(
  prevHash: string | null | undefined,
  event: Omit<AuditEvent, 'hash' | 'prev_hash'>
): AuditEvent {
  const effectivePrev = prevHash || GENESIS_PREV_HASH;
  const hash = calculateEventHash(effectivePrev, event);

  return {
    ...event,
    prev_hash: effectivePrev,
    hash,
  };
}

export interface ChainVerificationResult {
  verified: boolean;
  count: number;
  error?: string;
  brokenIndex?: number;
}

/**
 * Verifies the integrity of the audit log hash chain.
 * Sorts events chronologically (oldest first) and validates:
 * 1. Genesis event correctly references GENESIS_PREV_HASH or null
 * 2. Every subsequent event's prev_hash strictly matches the previous event's hash
 * 3. Every event's hash matches its canonical cryptographic recomputation
 */
export function verifyAuditChain(events: AuditEvent[]): ChainVerificationResult {
  if (!events || events.length === 0) {
    return { verified: true, count: 0 };
  }

  // Sort chronologically ascending (oldest to newest)
  const sorted = [...events].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeA === timeB) {
      return a.id.localeCompare(b.id);
    }
    return timeA - timeB;
  });

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];

    if (i === 0) {
      // First event must start from genesis
      if (event.prev_hash && event.prev_hash !== GENESIS_PREV_HASH) {
        return {
          verified: false,
          count: 0,
          brokenIndex: 0,
          error: `Genesis event ${event.id} does not link to GENESIS (found "${event.prev_hash}").`,
        };
      }
    } else {
      const prevEvent = sorted[i - 1];
      if (event.prev_hash !== prevEvent.hash) {
        return {
          verified: false,
          count: i,
          brokenIndex: i,
          error: `Chain broken at event ${event.id} (index ${i}): prev_hash "${event.prev_hash}" does not match prior event hash "${prevEvent.hash}".`,
        };
      }
    }

    const expectedHash = calculateEventHash(event.prev_hash, event);
    if (!event.hash || event.hash !== expectedHash) {
      return {
        verified: false,
        count: i,
        brokenIndex: i,
        error: `Payload tamper detected at event ${event.id} (index ${i}): recorded hash "${event.hash}" does not match computed hash "${expectedHash}".`,
      };
    }
  }

  return { verified: true, count: sorted.length };
}

/**
 * Ensures a list of audit events has an initialized, intact hash chain.
 */
export function initializeAuditChain(events: AuditEvent[]): AuditEvent[] {
  if (!events || events.length === 0) return [];

  const sorted = [...events].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeA === timeB) {
      return a.id.localeCompare(b.id);
    }
    return timeA - timeB;
  });

  let lastHash: string = GENESIS_PREV_HASH;
  const chained: AuditEvent[] = [];

  for (const ev of sorted) {
    const signed = signAuditEvent(lastHash, ev);
    lastHash = signed.hash!;
    chained.push(signed);
  }

  // Return sorted descending (newest first for UI display convention)
  return chained.reverse();
}
