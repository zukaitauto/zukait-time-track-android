import fs from 'node:fs';import assert from 'node:assert/strict';
const src=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
assert.match(src,/LEGACY_CONFLICT_MERGE/);
assert.match(src,/LEGACY_PERMISSION_REBASE/);
const calls=[...src.matchAll(/reconnectAudit\?\.record\?\.\(([^\n]*)/g)];
assert.equal(calls.length,2,'expected exactly two reconnect shadow audit hooks');
for(const m of calls){
  const line=m[0];
  assert.doesNotMatch(line,/state\s*=|cloudRevision\s*=|sessions\s*=|assign\s*=/,'audit hook must not mutate authority state');
}
assert.match(src,/try\{if\(me\?\.role==='Employee'\)window\.zukaitV2\?\.reconnectAudit/,'audit must be isolated behind try/catch');
const audit=fs.readFileSync('app/src/main/assets/v2/core/reconnect_shadow_audit.js','utf8');
assert.doesNotMatch(audit,/\bstate\s*=|cloudRevision\s*=|\.sessions\s*=|\.assign\s*=/,'shadow audit module must remain read-only');
assert.doesNotMatch(audit,/save\(|persistLocal\(|render\(|api\(/,'shadow audit must not trigger legacy writes, rendering, or server API');
console.log('V2 reconnect shadow read-only checks passed');
