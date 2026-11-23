'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');

function validate(request,latest,ref){
 assert.equal(ref,'refs/heads/architecture-v2','PC publication requires architecture-v2');
 assert.equal(request.approvedForStaff,true,'Staff release approval required');
 assert.match(String(request.approvedAt||''),/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/,'Valid approval timestamp required');
 assert.match(String(request.sourceCommit||''),/^[a-f0-9]{40}$/i,'Pinned approved source SHA required');
 assert.ok(typeof request.publishNonce==='string'&&request.publishNonce.length>=12,'Explicit publication nonce required');
 assert.ok(Number.isSafeInteger(Number(request.signedAcceptanceRun))&&Number(request.signedAcceptanceRun)>0,'Signed acceptance workflow run required');
 assert.equal(request.versionName,latest.versionName,'Approved version and updater must match');
 assert.equal(request.versionCode,latest.versionCode,'Approved code and updater must match');
 assert.match(String(latest.versionName||''),/^V\d+$/,'Unexpected release version');
 assert.ok(Number.isSafeInteger(latest.versionCode)&&latest.versionCode>0,'Invalid version code');
 return {sha:request.sourceCommit,versionName:request.versionName,versionCode:request.versionCode};
}
if(require.main===module){
 const request=JSON.parse(fs.readFileSync('release-request.json','utf8'));
 const latest=JSON.parse(fs.readFileSync('latest-version.json','utf8'));
 const result=validate(request,process.argv.includes('--coordinated')?request:latest,process.env.GITHUB_REF);
 process.stdout.write('SOURCE_SHA='+result.sha+'\n');
 process.stdout.write('SOURCE_VERSION_NAME='+result.versionName+'\n');
 process.stdout.write('SOURCE_VERSION_CODE='+result.versionCode+'\n');
}
module.exports={validate};
