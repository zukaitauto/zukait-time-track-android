import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=source.indexOf('function preserveClosedSessions(');
const end=source.indexOf('\nfunction reconcileAutoOvertime(',start);
assert.ok(start>=0&&end>start,'Server closed-session guard must exist');
const functionSource=source.slice(start,end)
  .replaceAll(': any','')
  .replace('const authoritative: any', 'const authoritative');
const guard=vm.runInNewContext(functionSource+'\npreserveClosedSessions', {Map,String,Number});

const current={sessions:[{id:'s1',emp:'EMP1',job:'JC1',start:100,end:250,paused:true,closeReason:'FINISHED'}]};
for(const stale of [
  {id:'s1',emp:'EMP1',job:'JC1',start:100},
  {id:'s1',emp:'EMP1',job:'JC1',start:100,end:200,paused:false,closeReason:'OLD'}
]){
  const result=guard({sessions:[stale]},current).sessions[0];
  assert.equal(result.end,250,'An old device cannot restore an earlier session end');
  assert.equal(result.paused,true,'The server terminal state must win');
  assert.equal(result.closeReason,'FINISHED');
}
const fresh=guard({sessions:[{id:'s2',emp:'EMP1',job:'JC1',start:300}]},current).sessions[0];
assert.equal(fresh.end,undefined,'A new session ID remains independent');
console.log('Legacy closed-session authority: ok');
