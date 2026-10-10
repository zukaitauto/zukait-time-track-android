'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const required=['client_https_restart','physical_android','physical_safari','full_data_preservation','fresh_backup_restored','pc_site_reconciled','production_backend_smoke'];
function validate(approval,record) {
 assert.equal(approval.approvedForStaff,true,'Staff approval required');
 assert.match(String(approval.sourceCommit||''),/^[0-9a-f]{40}$/i,'Approved source SHA required');
 assert.ok(typeof approval.approvedAt==='string'&&!Number.isNaN(Date.parse(approval.approvedAt)),'Approval timestamp required');
 assert.ok(typeof approval.publishNonce==='string'&&approval.publishNonce.length>=12,'Publication nonce required');
 assert.ok(Number.isSafeInteger(approval.signedAcceptanceRun)&&approval.signedAcceptanceRun>0,'Signed acceptance run required');
 assert.equal(record.versionName,approval.versionName,'Acceptance version mismatch');
 assert.equal(record.versionCode,approval.versionCode,'Acceptance version code mismatch');
 assert.equal(record.sourceCommit,approval.sourceCommit,'Acceptance source SHA mismatch');
 for(const key of required) {
  const check=record.checks?.[key];
  if(check?.passed!==true||typeof check.evidence!=='string'||check.evidence.trim().length<12||
     typeof check.verifiedBy!=='string'||check.verifiedBy.trim().length<2||
     !check.verifiedAt||Number.isNaN(Date.parse(check.verifiedAt))) {
   throw Error('V305 release blocked: missing independently verified evidence for '+key);
  }
 }
 return true;
}
if(require.main===module) {
 const approval=JSON.parse(fs.readFileSync('release-request.json','utf8'));
 const record=JSON.parse(fs.readFileSync('docs/INSURANCE_V305_ACCEPTANCE_GATE.json','utf8'));
 validate(approval,record);
 console.log('V305 acceptance gates verified for approved source '+approval.sourceCommit);
}
module.exports={validate,required};
