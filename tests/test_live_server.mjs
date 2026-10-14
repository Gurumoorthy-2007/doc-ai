// Live server endpoint test script against http://localhost:3000
const BASE_URL = 'http://localhost:3000';

async function testEndpoint(name, path, options = {}) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      const text = await res.text();
      body = `${text.slice(0, 120)}... (status ${res.status}, len ${text.length})`;
    }
    console.log(`[PASS] ${name}: status ${res.status}`);
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function runLiveVerification() {
  console.log('--- Testing Live DocuSentinel Server Endpoints ---');

  // 1. Root and Pages
  await testEndpoint('GET / (Home)', '/');
  await testEndpoint('GET /dashboard', '/dashboard');
  await testEndpoint('GET /documents', '/documents');
  await testEndpoint('GET /documents/upload', '/documents/upload');
  await testEndpoint('GET /reconciliation', '/reconciliation');
  await testEndpoint('GET /findings', '/findings');
  await testEndpoint('GET /review-queue', '/review-queue');
  await testEndpoint('GET /audit-trail', '/audit-trail');

  // 2. API Endpoints
  const statsRes = await testEndpoint('GET /api/dashboard/stats', '/api/dashboard/stats');
  console.log('   Stats:', JSON.stringify(statsRes.body?.data || {}));

  const docsRes = await testEndpoint('GET /api/documents', '/api/documents');
  console.log(`   Documents Count: ${docsRes.body?.data?.length || 0}`);

  const findingsRes = await testEndpoint('GET /api/findings', '/api/findings');
  console.log(`   Findings Count: ${findingsRes.body?.data?.length || 0}`);

  const auditRes = await testEndpoint('GET /api/audit-trail', '/api/audit-trail');
  console.log(`   Audit Events Count: ${auditRes.body?.data?.auditEvents?.length || 0}`);

  // 3. Test 3-Way Reconciliation API
  const reconRes = await testEndpoint('POST /api/reconciliation', '/api/reconciliation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId: 'doc-contract-abc',
      purchaseOrderId: 'doc-po-12456',
      invoiceId: 'doc-inv-4827',
      groupName: 'Live Test Group',
    }),
  });
  console.log('   Recon Result:', JSON.stringify({
    status: reconRes.body?.data?.group?.status,
    variance: reconRes.body?.data?.group?.variance,
    findingsCount: reconRes.body?.data?.findings?.length,
  }));

  // 4. Test Finding Review Submission API
  if (findingsRes.body?.data?.length > 0) {
    const findingId = findingsRes.body.data[0].id;
    const reviewRes = await testEndpoint(`POST /api/findings/${findingId}/review`, `/api/findings/${findingId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'accepted',
        comments: 'Verified discrepancy via live API test',
        reviewerName: 'Demo Reviewer',
      }),
    });
    console.log('   Review Result:', JSON.stringify({
      findingId,
      status: reviewRes.body?.data?.status,
      decision: reviewRes.body?.data?.review_decision,
    }));
  }

  console.log('--- Live Verification Complete ---');
}

runLiveVerification();
