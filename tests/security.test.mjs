// ============================================================
// DocuSentinel AI — Security & Authentication Tests (Phase 1)
// Verifies auth hardening, token tampering rejection, ownership
// enforcement, rate limiting, and Next.js 16 proxy behavior.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  authenticateRequest,
  checkDocumentOwnership,
  checkFindingOwnership,
  checkReconciliationOwnership,
  DEFAULT_DEMO_USER,
} from '../src/lib/server/auth.ts';

import {
  RateLimiter,
  InMemoryRateLimitStore,
  UPLOAD_LIMIT,
  PROCESS_LIMIT,
  AI_ROUTE_LIMIT,
} from '../src/lib/server/rateLimit.ts';

import {
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  validateAndInspectFile,
} from '../src/lib/server/fileStorage.ts';

import { proxy } from '../src/proxy.ts';

test('Security 1: Reject forged structured token (Bearer id:email:name:role)', async () => {
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  delete process.env.DEMO_MODE;
  process.env.NODE_ENV = 'development';

  try {
    const req = new NextRequest('http://localhost:3000/api/documents', {
      headers: {
        authorization: 'Bearer hacker-123:hacker@evil.com:Evil Hacker:admin',
      },
    });

    const result = await authenticateRequest(req);
    assert.equal(result.user, null, 'Forged token must not produce an authenticated user');
    assert.equal(result.status, 401, 'Forged token must return status 401');
    assert.match(result.error || '', /Unauthorized/, 'Must return unauthorized error message');
  } finally {
    process.env.DEMO_MODE = origDemo;
    process.env.NODE_ENV = origNodeEnv;
  }
});

test('Security 2: Reject x-user-* header spoofing', async () => {
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  delete process.env.DEMO_MODE;
  process.env.NODE_ENV = 'development';

  try {
    const req = new NextRequest('http://localhost:3000/api/documents', {
      headers: {
        'x-user-id': 'spoofed-admin-id',
        'x-user-role': 'admin',
        'x-user-email': 'admin@enterprise.com',
        'x-user-name': 'Fake Admin',
      },
    });

    const result = await authenticateRequest(req);
    assert.equal(result.user, null, 'Spoofed headers must not authenticate');
    assert.equal(result.status, 401, 'Must return 401');
  } finally {
    process.env.DEMO_MODE = origDemo;
    process.env.NODE_ENV = origNodeEnv;
  }
});

test('Security 3: Reject requests with no auth credentials and DEMO_MODE disabled', async () => {
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  process.env.DEMO_MODE = 'false';
  process.env.NODE_ENV = 'development';

  try {
    const req = new NextRequest('http://localhost:3000/api/documents');
    const result = await authenticateRequest(req);
    assert.equal(result.user, null);
    assert.equal(result.status, 401);
  } finally {
    process.env.DEMO_MODE = origDemo;
    process.env.NODE_ENV = origNodeEnv;
  }
});

test('Security 4: DEMO_MODE=true works only in non-production environments', async () => {
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    // 1. Allowed in development
    process.env.DEMO_MODE = 'true';
    process.env.NODE_ENV = 'development';
    const devReq = new NextRequest('http://localhost:3000/api/documents');
    const devResult = await authenticateRequest(devReq);
    assert.ok(devResult.user, 'Demo user should be returned in development');
    assert.equal(devResult.user?.role, 'admin');
    assert.equal(devResult.user?.email, 'demo@docusentinel.local');

    // 2. Blocked in production even if DEMO_MODE=true
    process.env.DEMO_MODE = 'true';
    process.env.NODE_ENV = 'production';
    const prodReq = new NextRequest('http://localhost:3000/api/documents');
    const prodResult = await authenticateRequest(prodReq);
    assert.equal(prodResult.user, null, 'Demo user must NOT be returned in production');
    assert.equal(prodResult.status, 401);
  } finally {
    process.env.DEMO_MODE = origDemo;
    process.env.NODE_ENV = origNodeEnv;
  }
});

test('Security 5: Document ownership authorization checks', () => {
  const standardUser = {
    id: 'user-alice-001',
    email: 'alice@example.com',
    name: 'Alice User',
    role: 'user',
  };

  const adminUser = {
    id: 'admin-bob-001',
    email: 'bob@example.com',
    name: 'Bob Admin',
    role: 'admin',
  };

  const reviewerUser = {
    id: 'rev-carol-001',
    email: 'carol@example.com',
    name: 'Carol Reviewer',
    role: 'reviewer',
  };

  const aliceDoc = {
    id: 'doc-001',
    user_id: 'user-alice-001',
    file_name: 'alice_invoice.pdf',
  };

  const otherDoc = {
    id: 'doc-002',
    user_id: 'user-dave-999',
    file_name: 'dave_invoice.pdf',
  };

  // Alice can access her own document
  assert.equal(checkDocumentOwnership(standardUser, aliceDoc), true);

  // Alice CANNOT access Dave's document
  assert.equal(checkDocumentOwnership(standardUser, otherDoc), false);

  // Admin can access any document
  assert.equal(checkDocumentOwnership(adminUser, aliceDoc), true);
  assert.equal(checkDocumentOwnership(adminUser, otherDoc), true);

  // Reviewer can access any document
  assert.equal(checkDocumentOwnership(reviewerUser, aliceDoc), true);
  assert.equal(checkDocumentOwnership(reviewerUser, otherDoc), true);
});

test('Security 6: Finding and Reconciliation ownership authorization checks', () => {
  const standardUser = {
    id: 'user-alice-001',
    email: 'alice@example.com',
    name: 'Alice User',
    role: 'user',
  };

  const adminUser = {
    id: 'admin-bob-001',
    email: 'bob@example.com',
    name: 'Bob Admin',
    role: 'admin',
  };

  const aliceFinding = {
    id: 'f-001',
    user_id: 'user-alice-001',
    title: 'Price variance',
  };

  const otherFinding = {
    id: 'f-002',
    user_id: 'user-other-999',
    title: 'Date mismatch',
  };

  assert.equal(checkFindingOwnership(standardUser, aliceFinding), true);
  assert.equal(checkFindingOwnership(standardUser, otherFinding), false);
  assert.equal(checkFindingOwnership(adminUser, otherFinding), true);

  const aliceRec = {
    id: 'rec-001',
    user_id: 'user-alice-001',
  };
  const otherRec = {
    id: 'rec-002',
    user_id: 'user-other-999',
  };

  assert.equal(checkReconciliationOwnership(standardUser, aliceRec), true);
  assert.equal(checkReconciliationOwnership(standardUser, otherRec), false);
  assert.equal(checkReconciliationOwnership(adminUser, otherRec), true);
});

test('Security 7: Rate limiter enforces quotas and sliding windows', async () => {
  const store = new InMemoryRateLimitStore();
  const limiter = new RateLimiter(store);

  const key = 'user-test-rl-1';
  const limit = 3;
  const windowMs = 5000;

  // Requests 1, 2, 3 should be allowed
  const r1 = await limiter.check(key, limit, windowMs);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2);

  const r2 = await limiter.check(key, limit, windowMs);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1);

  const r3 = await limiter.check(key, limit, windowMs);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 0);

  // Request 4 should be rejected (429)
  const r4 = await limiter.check(key, limit, windowMs);
  assert.equal(r4.allowed, false);
  assert.equal(r4.remaining, 0);
  assert.ok(r4.resetMs > 0, 'resetMs must be positive');

  // Different key is unaffected
  const otherKeyResult = await limiter.check('user-test-rl-2', limit, windowMs);
  assert.equal(otherKeyResult.allowed, true);

  store.destroy();
});

test('Security 8: Predefined rate limits are sane', () => {
  assert.ok(UPLOAD_LIMIT.limit <= 20, 'Upload limit must not exceed 20/min');
  assert.ok(PROCESS_LIMIT.limit <= 20, 'Process limit must not exceed 20/min');
  assert.ok(AI_ROUTE_LIMIT.limit <= 10, 'AI route limit must not exceed 10/min');
});

test('Security 9: Configurable MAX_FILE_SIZE_BYTES limits oversized payloads', async () => {
  assert.ok(MAX_FILE_SIZE_MB >= 1, 'Max file size must be at least 1MB');
  assert.equal(MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB * 1024 * 1024);

  // A simulated buffer exceeding MAX_FILE_SIZE_BYTES should throw
  const tinyLimitBytes = 50;
  const fakeBigBuffer = Buffer.alloc(100, 0x25); // %PDF header mock
  fakeBigBuffer.write('%PDF-1.4', 0);

  // Verify that an actual oversized file triggers an error
  const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024, 0x25);
  oversizedBuffer.write('%PDF-1.4', 0);

  await assert.rejects(
    async () => {
      await validateAndInspectFile(oversizedBuffer, 'huge.pdf');
    },
    /exceeds maximum allowed size/
  );
});

test('Security 10: Next.js 16 Proxy layer access control', async () => {
  const origDemo = process.env.DEMO_MODE;
  const origNodeEnv = process.env.NODE_ENV;
  delete process.env.DEMO_MODE;
  process.env.NODE_ENV = 'development';

  try {
    // 1. Unauthenticated API request -> 401 JSON
    const apiReq = new NextRequest('http://localhost:3000/api/documents');
    const apiRes = proxy(apiReq);
    assert.equal(apiRes.status, 401);
    const body = await apiRes.json();
    assert.equal(body.success, false);
    assert.match(body.error, /Unauthorized/);

    // 2. Unauthenticated Page request -> 307 Redirect to login
    const pageReq = new NextRequest('http://localhost:3000/dashboard');
    const pageRes = proxy(pageReq);
    assert.equal(pageRes.status, 307);
    const location = pageRes.headers.get('location');
    assert.ok(location?.includes('/auth/login'), 'Must redirect to /auth/login');
    assert.ok(location?.includes('redirect=%2Fdashboard'), 'Must preserve redirect destination');

    // 3. Excluded routes: /api/health -> allowed through
    const healthReq = new NextRequest('http://localhost:3000/api/health');
    const healthRes = proxy(healthReq);
    assert.equal(healthRes.status, 200);

    // 4. Authenticated request with Bearer header -> allowed through
    const authReq = new NextRequest('http://localhost:3000/api/documents', {
      headers: { authorization: 'Bearer some-session-token' },
    });
    const authRes = proxy(authReq);
    assert.equal(authRes.status, 200);

    // 5. Authenticated request with Supabase cookie -> allowed through
    const cookieReq = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: 'sb-sampleproject-auth-token=some-cookie-value' },
    });
    const cookieRes = proxy(cookieReq);
    assert.equal(cookieRes.status, 200);
  } finally {
    process.env.DEMO_MODE = origDemo;
    process.env.NODE_ENV = origNodeEnv;
  }
});
