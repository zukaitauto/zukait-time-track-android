// No backend contacted: verify that live QA tooling fails closed before transport.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reception-recovery-'));
const config={root:'https://omqgkqknbdcnotabffek.supabase.co',
 key:'sb_publishable_DBp6FI8Z4ThAq_4LXrZXSg_Xw2uPPgO',
 user:{id:'ZQA_RC_V305_MANAGER',role:'Manager'},token:'synthetic-selftest-not-a-session',
 journal:path.join(dir,'pending.json'),mode:'offline',command:{operation:'CREATE',details:{make:'QA',model:'Selftest'}}};
const run=(c,enabled='1')=>spawnSync(process.execPath,['tests/reception-isolated-recovery.mjs'],{
 input:JSON.stringify(c),encoding:'utf8',env:{...process.env,ZUKAIT_RECEPTION_ISOLATED:enabled}});
try {
 const first=run(config);assert.equal(first.status,0,first.stderr);
 const a=JSON.parse(first.stdout);assert.equal(a.requests,0);assert.equal(a.pending,1);
 const again=run(config);assert.equal(again.status,0,again.stderr);
 assert.equal(JSON.parse(again.stdout).request_id,a.request_id,'Fresh process retains saved UUID');
 const original=fs.readFileSync(config.journal,'utf8');
 for(const invalid of [
  {...config,root:'https://pjknotnjkufadqavcmii.supabase.co'},
  {...config,key:'sb_publishable_wrong'},
  {...config,user:{id:'MGR001',role:'Manager'}},
  {...config,token:'invalid\nheader'},
  {...config,mode:'unrecognized'},
 ])assert.notEqual(run(invalid).status,0);
 assert.notEqual(run(config,'0').status,0);
 assert.equal(fs.readFileSync(config.journal,'utf8'),original,'Rejected configurations retain pending evidence');
 console.log('Isolated recovery guards passed: offline sends zero requests; persisted UUID survives process restart; production/key/identity/token/mode/opt-in rejected. No backend contacted.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
