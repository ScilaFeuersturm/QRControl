import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {ApiError, normalizeServerUrl, normalizeTeamKey, requestJson} from '../src/lib/api.ts';
const originalFetch = globalThis.fetch;
afterEach(() => {globalThis.fetch = originalFetch;});
test('normalizes copied URL and rejects missing protocols and endpoint URLs', () => {
 assert.equal(normalizeServerUrl(' https://example.com/// '), 'https://example.com');
 for (const url of ['example.com', 'https://example.com/health', 'https://user:secret@example.com', 'file:///server']) assert.throws(() => normalizeServerUrl(url));
});
test('validates the actual key without accepting its variable name', () => {
 assert.equal(normalizeTeamKey('  '+'k'.repeat(32)+'\n'), 'k'.repeat(32));
 assert.throws(() => normalizeTeamKey('SCANNER_KEY'));
 assert.throws(() => normalizeTeamKey('k'.repeat(24)+'\nextra'));
});
test('wrong credentials remain distinct from connectivity failures', async () => {
 globalThis.fetch = async () => new Response('{"detail":"Credencial incorrecta"}', {status:401});
 await assert.rejects(requestJson('https://example.com','/session'), e => e instanceof ApiError && e.status === 401 && /Clave del equipo incorrecta/.test(e.message));
 globalThis.fetch = async () => {throw new TypeError('Failed to fetch');};
 await assert.rejects(requestJson('https://example.com','/session'), e => !(e instanceof ApiError) && /Internet del teléfono/.test(e.message));
});
test('HTML from a starting host is handled without a JSON parse error', async () => {
 globalThis.fetch = async () => new Response('<html>Starting</html>', {status:503});
 await assert.rejects(requestJson('https://example.com','/health'), e => e instanceof ApiError && e.status === 503);
});
test('timeout does not rely on AbortSignal.timeout and stays ambiguous for mutations', async () => {
 globalThis.fetch = async (_, {signal}) => new Promise((resolve,reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), {once:true}));
 await assert.rejects(requestJson('https://example.com','/check-in', {method:'POST', body:{}, timeoutMs:20}), e => !(e instanceof ApiError) && /tardó demasiado/.test(e.message));
});
test('caller cancellation is propagated', async () => {
 const controller = new AbortController();
 globalThis.fetch = async (_, {signal}) => new Promise((resolve,reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), {once:true}));
 const request=requestJson('https://example.com','/health', {signal:controller.signal}); controller.abort();
 await assert.rejects(request, /cancelada/);
});

test('accepts 204 responses without body', async () => {
  globalThis.fetch = async () => new Response(null, {status: 204});
  assert.equal(await requestJson('https://api.example.com', '/scanner-users/1', {method: 'DELETE'}), null);
});
