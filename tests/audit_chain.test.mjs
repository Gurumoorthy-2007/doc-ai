// ============================================================
// DocuSentinel AI — Cryptographic Audit Chain & Single SOT Tests (Phase 2)
// Verifies append-only SHA-256 hash chaining, tamper detection,
// repository selection, and audit trail verification endpoints.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  canonicalizeAuditEvent,
  calculateEventHash,
  signAuditEvent,
  verifyAuditChain,
  initializeAuditChain,
  GENESIS_PREV_HASH,
} from '../src/lib/server/auditChain.ts';

import {
  getRepository,
  resetRepositoryInstance,
  JsonRepository,
  SupabaseRepository,
} from '../src/lib/server/repository/index.ts';

import { ServerPersistence } from '../src/lib/server/persistence.ts';
import { GET as verifyRouteGET } from '../src/app/api/audit-trail/verify/route.ts';

test('Audit Chain 1: Deterministic canonical payload serialization', () => {
  const eventA = {
    id: 'evt-001',
    action: 'document_uploaded',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Invoice-101.pdf',
    details: 'Uploaded by demo user',
    user_name: 'Demo User',
    user_email: 'demo@docusentinel.local',
    created_at: '2026-10-14T10:00:00Z',
  };

  // Same values, different property insertion order
  const eventB = {
    created_at: '2026-10-14T10:00:00Z',
    user_email: 'demo@docusentinel.local',
    user_name: 'Demo User',
    details: 'Uploaded by demo user',
    entity_title: 'Invoice-101.pdf',
    entity_id: 'doc-001',
    entity_type: 'document',
    action: 'document_uploaded',
    id: 'evt-001',
  };

  const canonA = canonicalizeAuditEvent(eventA);
  const canonB = canonicalizeAuditEvent(eventB);

  assert.equal(canonA, canonB, 'Canonical JSON strings must be identical regardless of key order');

  const hashA = calculateEventHash(GENESIS_PREV_HASH, eventA);
  const hashB = calculateEventHash(GENESIS_PREV_HASH, eventB);

  assert.equal(hashA, hashB, 'SHA-256 hashes must match for identical event payloads');
  assert.equal(hashA.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
});

test('Audit Chain 2: Sequential hash linkage and verification', () => {
  const baseEvent1 = {
    id: 'evt-001',
    action: 'document_uploaded',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Invoice-101.pdf',
    details: 'Uploaded',
    user_name: 'Demo User',
    user_email: 'demo@docusentinel.local',
    created_at: '2026-10-14T10:00:00Z',
  };

  const signed1 = signAuditEvent(GENESIS_PREV_HASH, baseEvent1);
  assert.equal(signed1.prev_hash, GENESIS_PREV_HASH);
  assert.ok(signed1.hash && signed1.hash.length === 64);

  const baseEvent2 = {
    id: 'evt-002',
    action: 'document_processed',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Invoice-101.pdf',
    details: 'AI extraction completed',
    user_name: 'System Worker',
    user_email: 'system@docusentinel.local',
    created_at: '2026-10-14T10:05:00Z',
  };

  const signed2 = signAuditEvent(signed1.hash, baseEvent2);
  assert.equal(signed2.prev_hash, signed1.hash, 'Second event prev_hash must link to first event hash');

  const result = verifyAuditChain([signed1, signed2]);
  assert.equal(result.verified, true, 'Valid audit chain must pass verification');
  assert.equal(result.count, 2);
  assert.equal(result.error, undefined);
});

test('Audit Chain 3: Detect payload tampering in audit chain', () => {
  const base1 = {
    id: 'evt-001',
    action: 'document_uploaded',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Invoice-101.pdf',
    details: 'Initial upload',
    user_name: 'Demo User',
    user_email: 'demo@docusentinel.local',
    created_at: '2026-10-14T10:00:00Z',
  };

  const signed1 = signAuditEvent(GENESIS_PREV_HASH, base1);

  const base2 = {
    id: 'evt-002',
    action: 'review_approved',
    entity_type: 'finding',
    entity_id: 'fnd-001',
    entity_title: 'Price variance approved',
    details: 'Approved by authorized manager',
    user_name: 'Manager',
    user_email: 'manager@docusentinel.local',
    created_at: '2026-10-14T10:10:00Z',
  };

  const signed2 = signAuditEvent(signed1.hash, base2);

  // Tamper: an attacker modifies the details of event 2 without recalculating the cryptographic hash
  const tamperedEvent2 = {
    ...signed2,
    details: 'Approved by unauthorized intruder without audit entry',
  };

  const result = verifyAuditChain([signed1, tamperedEvent2]);
  assert.equal(result.verified, false, 'Tampered event payload must fail verification');
  assert.match(result.error || '', /Payload tamper detected/, 'Error message must identify payload tampering');
  assert.equal(result.brokenIndex, 1);
});

test('Audit Chain 4: Detect broken chain link (prev_hash tampering)', () => {
  const base1 = {
    id: 'evt-001',
    action: 'event_1',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Doc 1',
    details: 'Initial',
    user_name: 'User',
    user_email: 'user@docusentinel.local',
    created_at: '2026-10-14T10:00:00Z',
  };
  const signed1 = signAuditEvent(GENESIS_PREV_HASH, base1);

  const base2 = {
    id: 'evt-002',
    action: 'event_2',
    entity_type: 'document',
    entity_id: 'doc-001',
    entity_title: 'Doc 1',
    details: 'Second',
    user_name: 'User',
    user_email: 'user@docusentinel.local',
    created_at: '2026-10-14T10:05:00Z',
  };
  const signed2 = signAuditEvent(signed1.hash, base2);

  // Tamper: attacker splices the chain by pointing prev_hash to a random hash
  const splicedEvent2 = {
    ...signed2,
    prev_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  const result = verifyAuditChain([signed1, splicedEvent2]);
  assert.equal(result.verified, false, 'Spliced chain must fail verification');
  assert.match(result.error || '', /Chain broken at event/, 'Error message must identify broken chain link');
});

test('Audit Chain 5: Detect invalid genesis link', () => {
  const fakeGenesis = {
    id: 'evt-000',
    action: 'init',
    entity_type: 'system',
    entity_id: 'sys',
    entity_title: 'System',
    details: 'Genesis with forged prev_hash',
    user_name: 'Attacker',
    user_email: 'attacker@evil.com',
    created_at: '2026-10-14T10:00:00Z',
    prev_hash: 'BOGUS_GENESIS',
    hash: 'something',
  };

  const result = verifyAuditChain([fakeGenesis]);
  assert.equal(result.verified, false, 'Invalid genesis link must fail verification');
  assert.match(result.error || '', /does not link to GENESIS/);
});

test('Audit Chain 6: initializeAuditChain builds unbroken chain from unhashed events', () => {
  const rawEvents = [
    {
      id: 'evt-3',
      action: 'third',
      entity_type: 'document',
      entity_id: 'doc-1',
      entity_title: 'Doc',
      details: 'Third',
      user_name: 'User',
      user_email: 'user@local',
      created_at: '2026-10-14T12:00:00Z',
    },
    {
      id: 'evt-1',
      action: 'first',
      entity_type: 'document',
      entity_id: 'doc-1',
      entity_title: 'Doc',
      details: 'First',
      user_name: 'User',
      user_email: 'user@local',
      created_at: '2026-10-14T10:00:00Z',
    },
    {
      id: 'evt-2',
      action: 'second',
      entity_type: 'document',
      entity_id: 'doc-1',
      entity_title: 'Doc',
      details: 'Second',
      user_name: 'User',
      user_email: 'user@local',
      created_at: '2026-10-14T11:00:00Z',
    },
  ];

  const chained = initializeAuditChain(rawEvents);
  assert.equal(chained.length, 3);

  // verifyAuditChain sorts chronologically ascending internally
  const verifyResult = verifyAuditChain(chained);
  assert.equal(verifyResult.verified, true, 'Initialized chain must be cryptographically sound');
  assert.equal(verifyResult.count, 3);
});

test('Audit Chain 7: Repository factory selects JsonRepository or SupabaseRepository based on config', () => {
  const origType = process.env.DATA_STORE_TYPE;
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // 1. Explicit json type
    resetRepositoryInstance();
    process.env.DATA_STORE_TYPE = 'json';
    const repo1 = getRepository();
    assert.ok(repo1 instanceof JsonRepository, 'Must return JsonRepository when DATA_STORE_TYPE=json');

    // 2. Explicit supabase type with dummy credentials
    resetRepositoryInstance();
    process.env.DATA_STORE_TYPE = 'supabase';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-12345';
    const repo2 = getRepository();
    assert.ok(repo2 instanceof SupabaseRepository, 'Must return SupabaseRepository when DATA_STORE_TYPE=supabase');

    // 3. Fallback when credentials missing
    resetRepositoryInstance();
    delete process.env.DATA_STORE_TYPE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const repo3 = getRepository();
    assert.ok(repo3 instanceof JsonRepository, 'Must fallback to JsonRepository when Supabase is unconfigured');
  } finally {
    if (origType === undefined) delete process.env.DATA_STORE_TYPE;
    else process.env.DATA_STORE_TYPE = origType;

    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;

    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;

    resetRepositoryInstance();
  }
});

test('Audit Chain 8: ServerPersistence audit logging and chain verification', async () => {
  // Ensure default demo user can perform logging
  const testEvent = {
    user_id: 'usr-demo-admin-001',
    user_name: 'Demo Admin',
    user_email: 'demo@docusentinel.local',
    action: 'chain_test_action',
    entity_type: 'system',
    entity_id: 'sys-001',
    entity_title: 'Integrity Verification',
    details: 'Verifying automated chain integrity',
  };

  const logged = await ServerPersistence.addAuditEvent(testEvent);
  assert.ok(logged.hash, 'Logged event must contain computed SHA-256 hash');
  assert.ok(logged.prev_hash, 'Logged event must contain prev_hash link');

  const verifyResult = await ServerPersistence.verifyAuditChain();
  assert.equal(verifyResult.verified, true, 'Live ServerPersistence audit chain must pass verification');
  assert.ok(verifyResult.count >= 1, 'Verification count must reflect recorded events');
});

test('Audit Chain 9: GET /api/audit-trail/verify route authentication and verification', async () => {
  // 1. Unauthenticated request rejected
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  const origUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DEMO_MODE;
  process.env.NODE_ENV = 'development';

  try {
    const unauthReq = new NextRequest('http://localhost:3000/api/audit-trail/verify');
    const unauthRes = await verifyRouteGET(unauthReq);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');

    // 2. Authenticated request via Demo Mode
    process.env.DEMO_MODE = 'true';
    const authReq = new NextRequest('http://localhost:3000/api/audit-trail/verify');
    const authRes = await verifyRouteGET(authReq);
    assert.equal(authRes.status, 200, 'Authenticated request must return 200');

    const json = await authRes.json();
    assert.equal(json.success, true);
    assert.equal(json.data.verified, true);
    assert.ok(typeof json.data.count === 'number');
  } finally {
    if (origDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = origDemo;

    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;

    if (origUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = origUrl;

    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});
