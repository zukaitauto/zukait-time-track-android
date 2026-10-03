import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the JavaScript that Android actually sends to the WebView.
const java = fs.readFileSync('app/src/main/java/com/zukait/timetrack/MainActivity.java', 'utf8');
const method = java.slice(java.indexOf('    private void requestInstallAfterCloudSync()'), java.indexOf('    private void installDownloadedUpdateNative()'));
const argument = method.match(/webView\.evaluateJavascript\(([\s\S]*?),\s*null\s*\);/);
assert.ok(argument, 'Android must request workshop synchronization before installing');
const guard = argument[1].match(/"(?:[^"\\]|\\.)*"/g).map(literal => JSON.parse(literal)).join('');
const cloudSource = fs.readFileSync('app/src/main/assets/cloud_sync.js', 'utf8');
const startedAt = 100_000;
const cleanHealth = () => ({
  ready: true, dirty: false, pushing: false, pulling: false, pendingConflict: false,
  lastSuccessfulSyncAt: startedAt + 1, lastError: ''
});
const failures = [];
let checks = 0;
async function check(name, run) {
  checks++;
  try { await run(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}

function mockedCloud(health, sync = async () => {}) {
  const decisions = [];
  const cloud = {syncNow: sync, syncHealth: health};
  const context = {
    window: {zukaitCloud: cloud, AndroidBridge: {completeUpdatePreInstallSync: safe => decisions.push(safe)}},
    navigator: {onLine: true}, Date: {now: () => startedAt}
  };
  return {cloud, context, decisions, run: () => vm.runInNewContext(guard, context)};
}

await check('missing cloud sync API postpones installation', async () => {
  const h = mockedCloud(cleanHealth());
  delete h.context.window.zukaitCloud;
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
for (const health of [undefined, {}, {...cleanHealth(), ready: false}]) {
  await check('absent or unready sync status postpones installation', async () => {
    const h = mockedCloud(health);
    await h.run();
    assert.deepEqual(h.decisions, [false]);
  });
}
for (const flag of ['dirty', 'pushing', 'pulling', 'pendingConflict']) {
  for (const value of [true, undefined]) {
    await check(`${flag}=${value} cannot authorize installation`, async () => {
      const h = mockedCloud({...cleanHealth(), [flag]: value});
      await h.run();
      assert.deepEqual(h.decisions, [false]);
    });
  }
}
for (const timestamp of [0, startedAt - 1, '100001', NaN, Infinity, undefined]) {
  await check(`unconfirmed sync timestamp ${timestamp} postpones installation`, async () => {
    const h = mockedCloud({...cleanHealth(), lastSuccessfulSyncAt: timestamp});
    await h.run();
    assert.deepEqual(h.decisions, [false]);
  });
}
await check('a remaining sync error postpones installation', async () => {
  const h = mockedCloud({...cleanHealth(), lastError: 'NETWORK'});
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
await check('offline devices keep their downloaded update', async () => {
  const h = mockedCloud(cleanHealth());
  h.context.navigator.onLine = false;
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
await check('a rejected sync attempt postpones installation', async () => {
  const h = mockedCloud(cleanHealth(), async () => { throw new Error('NETWORK'); });
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
await check('Android waits for sync completion and accepts fresh clean status', async () => {
  let complete;
  const waiting = new Promise(resolve => { complete = resolve; });
  const h = mockedCloud({...cleanHealth(), lastSuccessfulSyncAt: 0}, () => waiting);
  const running = h.run();
  assert.deepEqual(h.decisions, [], 'installer must not start before synchronization finishes');
  h.cloud.syncHealth = cleanHealth();
  complete();
  await running;
  assert.deepEqual(h.decisions, [true]);
});
await check('a new unsaved edit during sync postpones installation', async () => {
  const h = mockedCloud(cleanHealth(), async () => { h.cloud.syncHealth.dirty = true; });
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});

// Run the complete workshop sync module with isolated storage and mocked HTTP.
// No requests reach Supabase and no timers run workshop background polling.
function workshop() {
  const storage = new Map();
  const decisions = [];
  const requests = [];
  let clock = startedAt;
  let token = 'test-session';
  let response = {ok: true, revision: 1, data: {users: [], jobs: [], sessions: []}};
  let networkFailure = false;
  const status = {textContent: '', dataset: {}, style: {}};
  const elements = new Map([['cloudStatus', status]]);
  const makeElement = tag => ({
    tagName: String(tag||'').toUpperCase(), id: '', className: '', textContent: '', title: '',
    dataset: {}, style: {}, children: [],
    appendChild(child){ this.children.push(child); if(child?.id) elements.set(child.id, child); return child; },
    insertBefore(child){ return this.appendChild(child); }
  });
  const body = makeElement('body');
  const context = vm.createContext({
    window: {
      zukaitAuth: {getToken: () => token}, addEventListener() {},
      AndroidBridge: {completeUpdatePreInstallSync: safe => decisions.push(safe)}
    },
    document: {visibilityState: 'visible', body, addEventListener() {}, createElement: makeElement, getElementById: id => elements.get(id)||null},
    navigator: {onLine: true}, Date: {now: () => clock},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    state: {users: [], jobs: [], sessions: []}, users: [], me: null, KEY: 'test-workshop-cache',
    setTimeout: () => 1, clearTimeout() {}, AbortController,
    console: {warn() {}, error() {}},
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      if (networkFailure) throw new Error('NETWORK');
      return {status: response.ok ? 200 : 401, json: async () => structuredClone(response)};
    }
  });
  vm.runInContext(cloudSource, context);
  return {
    context, decisions, requests, storage,
    cloud: context.window.zukaitCloud,
    setToken: value => { token = value; }, advanceClock: () => { clock += 1000; },
    setResponse: value => { response = value; }, failNetwork: () => { networkFailure = true; },
    run: () => vm.runInContext(guard, context)
  };
}

await check('actual syncNow without a session cannot confirm a first sync', async () => {
  const h = workshop();
  h.setToken('');
  await h.run();
  assert.equal(h.cloud.syncHealth.ready, true, 'login-required init can be marked ready');
  assert.equal(h.cloud.syncHealth.lastSuccessfulSyncAt, 0);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.decisions, [false]);
});
await check('actual syncNow with an expired local session cannot reuse an older successful sync', async () => {
  const h = workshop();
  await h.cloud.syncNow();
  const previousSync = h.cloud.syncHealth.lastSuccessfulSyncAt;
  assert.ok(previousSync > 0);
  h.advanceClock();
  h.setToken('');
  await h.run();
  assert.equal(h.cloud.syncHealth.lastSuccessfulSyncAt, previousSync);
  assert.equal(h.requests.length, 1, 'missing session skips the next load');
  assert.deepEqual(h.decisions, [false]);
});
await check('an actual successful workshop load authorizes installation', async () => {
  const h = workshop();
  await h.run();
  assert.deepEqual(h.requests, [{action: 'load'}]);
  assert.deepEqual(h.decisions, [true]);
});
await check('a revoked DB session postpones installation', async () => {
  const h = workshop();
  h.setResponse({ok: false, code: 'invalid_session'});
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
await check('an actual workshop network failure postpones installation', async () => {
  const h = workshop();
  h.failNetwork();
  await h.run();
  assert.deepEqual(h.decisions, [false]);
});
await check('a pending workshop conflict stays available and blocks installation', async () => {
  const h = workshop();
  const conflict = JSON.stringify({user: 'EMP1', data: {jobs: [{no: 'JC1'}]}});
  h.storage.set('zukait_cloud_pending_conflict_v42', conflict);
  await h.run();
  assert.deepEqual(h.decisions, [false]);
  assert.equal(h.storage.get('zukait_cloud_pending_conflict_v42'), conflict);
});

assert.deepEqual(failures, [], 'Android pre-install sync safety failures');
console.log(`Native update pre-install sync: ${checks} runtime safety checks passed`);
