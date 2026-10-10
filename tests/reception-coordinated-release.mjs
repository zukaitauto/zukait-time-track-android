import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {manifest,verifyPages,verifyRelease}=createRequire(import.meta.url)('../scripts/verify-coordinated-release.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zukait-parity-'));
try {
  fs.writeFileSync(path.join(dir,'index.html'),'<script src="reception.js?v=305"></script>');
  fs.writeFileSync(path.join(dir,'receptionist.html'),'<script src="reception.js?v=305"></script>');
  fs.writeFileSync(path.join(dir,'reception.js'),'new UI');
  const sha='a'.repeat(40), apk=Buffer.from('accepted signed APK fixture');
  const record=manifest(dir,{sourceCommit:sha,versionName:'V305',versionCode:268,signedAcceptanceRun:123},sha,apk);
  fs.writeFileSync(path.join(dir,'release-integrity.json'),JSON.stringify(record));
  const response=(url,data)=>({url,ok:true,status:200,arrayBuffer:async()=>Buffer.from(data)});
  const fetcher=async url=>response(url,fs.readFileSync(path.join(dir,new URL(url).pathname.split('/').at(-1))));
  await verifyPages(record,dir,fetcher);
  for(const stale of ['index.html','reception.js','release-integrity.json']) {
    await assert.rejects(verifyPages(record,dir,async url=>url.endsWith(stale)?response(url,'old'):fetcher(url)),/Stale\/mixed/);
  }
  await assert.rejects(verifyPages(record,dir,async url=>url.endsWith('?v=305')?response(url,'old cached script'):fetcher(url)),/Stale script URL/);
  await assert.rejects(verifyPages(record,dir,async url=>({url,ok:false,status:404})),/HTTP 404/);
  assert.throws(()=>manifest(dir,{sourceCommit:'b'.repeat(40)},sha,apk));
  const metadata={...record,package:'com.zukait.timetrack'};
  const release={tag_name:record.releaseTag,draft:false,prerelease:false,assets:[{name:'ZUKAIT_TIME_TRACK_LATEST.apk',browser_download_url:`https://github.com/zukaitauto/zukait-time-track-android/releases/download/${record.releaseTag}/ZUKAIT_TIME_TRACK_LATEST.apk`}]};
  const publicFetch=async url=>response(url,url.includes('raw.githubusercontent')?JSON.stringify(metadata):url.includes('api.github')?JSON.stringify(release):apk);
  await verifyRelease(record,publicFetch);
  metadata.versionCode=267;
  await assert.rejects(verifyRelease(record,publicFetch),/Updater mismatch/);
  metadata.versionCode=268;
  await assert.rejects(verifyRelease(record,async url=>url.endsWith('.apk')?response(url,'wrong apk'):publicFetch(url)),/Public APK/);
  release.tag_name='release-V304-architecture-v2';
  await assert.rejects(verifyRelease(record,publicFetch));
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
const workflow=fs.readFileSync('.github/workflows/publish-approved-release.yml','utf8');
const order=['Verify complete V305 acceptance','Pin both clients','Retrieve the exact physically accepted signed APK','Verify accepted APK embedded','Create draft GitHub release','Deploy coordinated Pages candidate','Verify public Pages bytes','Make approved release public','Verify public signed APK before updater','Publish matching update metadata','Verify public updater'];
let last=-1;
for(const step of order){const pos=workflow.indexOf(step);assert.ok(pos>last,step+' ordering');last=pos;}
assert.match(workflow,/group: github-pages/);
assert.match(workflow,/force-with-lease="refs\/heads\/architecture-v2:\$APPROVAL_SHA"/);
assert.doesNotMatch(workflow,/git rebase|gh release delete|gradle assembleRelease/);
assert.match(workflow,/\.head_sha.*SOURCE_SHA/);
assert.match(fs.readFileSync('.github/workflows/pages.yml','utf8'),/Require single coordinated publisher[\s\S]*?exit 1/);
const legacy=fs.readFileSync('.github/workflows/pages.yml','utf8').replaceAll('\r\n','\n');
const staging=content=>content.replaceAll('\r\n','\n').split('      - name: Prepare PC site\n')[1].split('      - name: Verify staged shared Reception UI assets before public deployment\n')[0];
assert.equal(staging(workflow),staging(legacy),'Staging-only CI and coordinator must use identical packaging');
console.log('PASS: coordinated order, immutable candidate, stale CDN/script/updater/APK rejection, fail-closed publication');
