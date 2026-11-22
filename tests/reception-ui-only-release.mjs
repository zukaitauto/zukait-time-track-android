import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const {validate}=createRequire(import.meta.url)('../scripts/verify-ui-only-release.cjs');
const request={releaseScope:'phase1-compatible-ui',approvedForStaff:true,ownerRequestedImmediateRelease:true,backupDeferredByOwner:true,productionBackendChanges:false,phase2ActivationApproved:false,physicalAcceptanceStatus:'NOT_RUN',versionName:'V305',versionCode:268,sourceCommit:'a'.repeat(40),signedAcceptanceRun:123,verificationRun:124,approvedAt:'2026-10-10T13:00:00Z',publishNonce:'ui-only-test-nonce'};
const record={checks:{fresh_backup_restored:{passed:false},physical_android:{passed:false},physical_safari:{passed:false}}};
assert.equal(validate(request,'refs/heads/architecture-v2',record),true);
assert.equal(validate({...request,versionName:'V306',versionCode:269},'refs/heads/architecture-v2',record),true);
for(const bad of [{versionName:'main'},{versionName:'V304'},{versionCode:267},{versionCode:268.5}])assert.throws(()=>validate({...request,...bad},'refs/heads/architecture-v2',record));
for(const bad of [{productionBackendChanges:true},{phase2ActivationApproved:true},{backupDeferredByOwner:false},{physicalAcceptanceStatus:'PASSED'},{sourceCommit:'main'},{approvedForStaff:false},{ownerRequestedImmediateRelease:false}])assert.throws(()=>validate({...request,...bad},'refs/heads/architecture-v2',record));
assert.throws(()=>validate(request,'refs/heads/main',record));
assert.throws(()=>validate(request,'refs/heads/architecture-v2',{checks:{physical_android:{passed:true}}}));
// Old V306 publication approval may remain as history while V307 is an unapproved candidate.
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-release-gate-'));
try {
 const candidate={versionName:'V307',versionCode:270,approvedForStaff:false};
 fs.writeFileSync(path.join(tmp,'release-request.json'),JSON.stringify(candidate)+'\n');
 fs.writeFileSync(path.join(tmp,'release-ui-request.json'),
   JSON.stringify({...request,versionName:'V306',versionCode:269})+'\n');
 const script=fileURLToPath(new URL('../scripts/verify-ui-only-release.cjs',import.meta.url));
 const run=spawnSync(process.execPath,[script],{cwd:tmp,encoding:'utf8',env:{...process.env,GITHUB_REF:'refs/heads/architecture-v2'}});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/UI_ONLY_PUBLICATION=false/,'Stale V306 approval must not authorize V307');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp,'release-request.json'),'utf8')),candidate);
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
const publishWorkflow=fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');
assert.match(publishWorkflow,/git merge-base --is-ancestor "\$SOURCE_SHA" "\$VERIFY_SHA"/,
 'Reception verification may be on an approved metadata-only descendant of the pinned source');
assert.match(publishWorkflow,/git diff --quiet "\$SOURCE_SHA" "\$VERIFY_SHA" -- \. \\\s*'\:\(exclude\)release-request\.json' \\\s*'\:\(exclude\)release-ui-request\.json'/,
 'Any runtime or test source drift must stop UI-only publication');
assert.match(publishWorkflow,/\.path' \/tmp\/ui-verification-run\.json\)" = "\.github\/workflows\/reception-check\.yml"/,
 'Only Reception verification may provide UI publication provenance');
console.log('PASS: explicit UI-only owner waiver; historical approval cannot publish newer unapproved candidate');
