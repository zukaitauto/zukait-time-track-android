import assert from 'node:assert/strict';
import {liveStatusDiff,liveStatusProjectionMatches} from '../scripts/employee-live-status-diff.mjs';
const rows=Array.from({length:18},(_,i)=>({employee_id:'E'+(i+1),employee_name:'Employee '+(i+1),status:'Available',job_no:'',session_start:null,suggested_minutes:0,overtime:false,state_revision:10}));
assert.deepEqual(liveStatusDiff(rows,rows.map(x=>({...x,state_revision:11,updated_by:'manager'}))),{changed:[],removed:[]},'revision-only change must not rewrite 18 employees');
const changed=rows.map(x=>({...x,state_revision:11}));changed[6]={...changed[6],status:'Working',job_no:'JC123',session_start:12345};
assert.deepEqual(liveStatusDiff(rows,changed).changed.map(x=>x.employee_id),['E7']);
assert.deepEqual(liveStatusDiff(changed,changed),{changed:[],removed:[]});
assert.deepEqual(liveStatusDiff(rows,changed.slice(0,17)).removed,['E18']);
assert.throws(()=>liveStatusDiff(rows,[...changed,changed[0]]),/duplicate_expected/);
assert.throws(()=>liveStatusDiff([...rows,rows[0]],changed),/duplicate_current/);
console.log('Selective live-status candidate: 6 assertions passed (18 simulated employees).');

const revisionOnly=rows.map(x=>({...x,state_revision:11}));
assert.equal(liveStatusProjectionMatches(rows,revisionOnly,11),true,'unchanged rows remain valid at newer global revision');
assert.equal(liveStatusProjectionMatches(rows,changed,11),false,'stale employee status must fail verification');
assert.equal(liveStatusProjectionMatches(changed,changed,11),true,'changed status matches authoritative projection');
assert.equal(liveStatusProjectionMatches(changed.map(x=>({...x,state_revision:12})),changed,11),false,'future row revisions fail closed');
assert.equal(liveStatusProjectionMatches(rows.slice(1),rows,11),false,'missing employee fails closed');
assert.equal(liveStatusProjectionMatches(rows,rows,0),false,'invalid global revision fails closed');
console.log('Revision-safe projection contract: 6 assertions passed.');

for(let round=0;round<1000;round++){
  const before=rows.map(x=>({...x,state_revision:10+round}));
  const after=before.map(x=>({...x,state_revision:11+round}));
  const index=round%18;
  after[index]={...after[index],status:round%2?'Paused':'Working',job_no:'JC'+round};
  const delta=liveStatusDiff(before,after);
  assert.equal(delta.changed.length,1,'one employee change must touch one row');
  assert.equal(delta.changed[0].employee_id,'E'+(index+1));
  assert.equal(delta.removed.length,0);
  assert.equal(liveStatusProjectionMatches(before,after,11+round),false);
  assert.equal(liveStatusProjectionMatches(after,after,11+round),true);
}
console.log('1000 deterministic 18-employee transition simulations passed.');
