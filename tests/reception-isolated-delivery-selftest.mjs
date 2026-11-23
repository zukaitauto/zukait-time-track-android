// Fail-closed checks only. No QA connection and no delivery mutations.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const base={root:'https://omqgkqknbdcnotabffek.supabase.co',
 key:'sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO',
 user:{id:'ZQA_RC_V305_RECEPTION',role:'Receptionist'},
 token:'synthetic-selftest-token',journal:path.join(os.tmpdir(),'zukait-isolated-delivery-selftest.json'),
 mode:'preflight'};
const run=(c,env={})=>spawnSync(process.execPath,['tests/reception-isolated-delivery.mjs'],{
 input:JSON.stringify(c),encoding:'utf8',env:{...process.env,ZUKAIT_RECEPTION_ISOLATED:'1',...env}});
const success=run(base);
assert.equal(success.status,0,success.stderr);
assert.match(success.stdout,/no network/);
for(const c of [
 {...base,root:'https://pjknotnjkufadqavcmii.supabase.co'},
 {...base,root:'https://another-project.supabase.co'},
 {...base,key:'sb_publishable_wrong'},
 {...base,user:{...base.user,id:'REC001'}},
 {...base,user:{...base.user,role:'Manager'}},
 {...base,token:'injected\nHeader: x'},
 {...base,mode:'invalid'}
])assert.notEqual(run(c).status,0,'Unsafe runner config was accepted');
assert.notEqual(run(base,{ZUKAIT_RECEPTION_ISOLATED:'0'}).status,0);
const body={action:'receptionist_deliver',operation:'DELIVER',jobCard:'QA-ONLY-1',
 expectedQcRevision:1,expectedVehicleIdentity:'[]',request_id:'a554e01b-09a7-44d5-80f5-449709271b44'};
assert.notEqual(run({...base,mode:'drop',delivery:body}).status,0,'HTTPS mutations need explicit separate opt-in');
assert.notEqual(run({...base,mode:'offline',delivery:{...body,jobCard:'12037'}}).status,0,
 'Real-looking non-QA Job Cards must be rejected');
console.log('QA delivery HTTPS runner guards PASS: project, key, actor, token, mode, opt-in, synthetic identity. No network.');
