import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {validate,required}=createRequire(import.meta.url)('../scripts/verify-v305-acceptance.cjs');
const request=JSON.parse(fs.readFileSync('release-request.json','utf8'));
const actual=JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8'));
assert.equal(typeof request.approvedForStaff,'boolean');
assert.equal(required.length,7);
// A standard release may complete the real evidence record. Validate its linkage
// rather than treating the historical incomplete record as a permanent fixture.
if (!request.approvedForStaff) assert.throws(()=>validate(request,actual),/Staff approval required/);
else if (request.releaseScope==='standard') {
 assert.equal(validate(request,actual),true,'Approved standard release requires all seven evidenced gates');
} else if (required.some(key=>actual.checks[key]?.passed!==true)) {
 assert.throws(()=>validate(request,actual),'Incomplete evidence must not validate under another release scope');
} else assert.equal(validate(request,actual),true);
const good={...request,approvedForStaff:true,sourceCommit:'a'.repeat(40),approvedAt:'2026-10-10T06:00:00Z',publishNonce:'fixture-only-nonce',signedAcceptanceRun:12345};
const complete={...actual,versionName:good.versionName,versionCode:good.versionCode,sourceCommit:good.sourceCommit,checks:Object.fromEntries(required.map(k=>[k,{passed:true,evidence:'docs/QA-'+k+'.md',verifiedBy:'QA Reviewer',verifiedAt:'2026-10-10T05:00:00Z'}]))};
assert.equal(validate(good,complete),true,'Synthetic complete attestation must validate');
for(const key of required) {
 const missing={...complete,checks:{...complete.checks,[key]:{...complete.checks[key],passed:false}}};
 assert.throws(()=>validate(good,missing),new RegExp(key));
}
assert.throws(()=>validate({...good,sourceCommit:'b'.repeat(40)},complete),/source SHA mismatch/);
assert.throws(()=>validate({...good,signedAcceptanceRun:null},complete),/Signed acceptance run/);
console.log('PASS: all 7 release acceptance gates fail closed until evidenced and linked to approved SHA');
