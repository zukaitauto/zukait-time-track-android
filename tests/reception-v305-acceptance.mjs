import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {validate,required}=createRequire(import.meta.url)('../scripts/verify-v305-acceptance.cjs');
const request=JSON.parse(fs.readFileSync('release-request.json','utf8'));
const actual=JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8'));
assert.equal(request.approvedForStaff,false);
assert.equal(required.length,7);
assert.throws(()=>validate(request,actual),/Staff approval required/);
const good={...request,approvedForStaff:true,sourceCommit:'a'.repeat(40),approvedAt:'2026-10-10T06:00:00Z',publishNonce:'fixture-only-nonce',signedAcceptanceRun:12345};
const complete={...actual,sourceCommit:good.sourceCommit,checks:Object.fromEntries(required.map(k=>[k,{passed:true,evidence:'docs/QA-'+k+'.md',verifiedBy:'QA Reviewer',verifiedAt:'2026-10-10T05:00:00Z'}]))};
assert.equal(validate(good,complete),true,'Synthetic complete attestation must validate');
for(const key of required) {
 const missing={...complete,checks:{...complete.checks,[key]:{...complete.checks[key],passed:false}}};
 assert.throws(()=>validate(good,missing),new RegExp(key));
 assert.equal(actual.checks[key].passed,false,'Do not mark incomplete actual gate as passed');
}
assert.throws(()=>validate({...good,sourceCommit:'b'.repeat(40)},complete),/source SHA mismatch/);
assert.throws(()=>validate({...good,signedAcceptanceRun:null},complete),/Signed acceptance run/);
console.log('PASS: all 7 release acceptance gates fail closed until evidenced and linked to approved SHA');
