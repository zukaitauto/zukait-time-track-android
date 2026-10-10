'use strict';
// Public delivery checks only. Never authenticates to the workshop or writes staff data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const SITE = 'https://zukaitauto.github.io/zukait-time-track-android/';
const REPO = 'zukaitauto/zukait-time-track-android';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function manifest(dir, approval, sourceSha, apk) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(approval.sourceCommit, sourceSha);
  const files = {};
  function walk(root) {
    for (const item of fs.readdirSync(root, {withFileTypes:true})) {
      const file = path.join(root, item.name);
      assert.ok(!item.isSymbolicLink(), 'No symlinks in publication');
      if (item.isDirectory()) walk(file);
      else {
        const relative = path.relative(dir, file).split(path.sep).join('/');
        if (relative !== 'release-integrity.json' && relative !== '.nojekyll') files[relative] = hash(fs.readFileSync(file));
      }
    }
  }
  walk(dir);
  assert.ok(files['index.html'] && files['receptionist.html']);
  return {schemaVersion:1, sourceCommit:sourceSha, versionName:approval.versionName,
    versionCode:approval.versionCode, signedAcceptanceRun:approval.signedAcceptanceRun,
    releaseTag:`release-${approval.versionName}-architecture-v2`, apkSha256:hash(apk), files};
}
async function bytes(url, fetcher=fetch) {
  const response = await fetcher(url, {redirect:'follow', signal:AbortSignal.timeout(30000),
    headers:{'Cache-Control':'no-cache', 'User-Agent':'Zukait-Coordinated-Release-Verification'}});
  assert.equal(new URL(response.url || url).protocol, 'https:');
  assert.ok(response.ok, `HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function verifyPages(record, dir, fetcher=fetch) {
  const expected = fs.readFileSync(path.join(dir, 'release-integrity.json'));
  const entries = {'release-integrity.json':hash(expected), ...record.files};
  const verified = [];
  for (const [relative, digest] of Object.entries(entries)) {
    assert.ok(!relative.includes('..') && !relative.startsWith('/') && !relative.includes(':'), 'Unsafe manifest path');
    // Check the ordinary staff URL as well as a cache-busted URL. A cache-busted
    // success alone must not conceal stale normal URLs on the Pages CDN.
    for (const query of ['', `?release=${record.sourceCommit}`]) {
      const url = new URL(relative + query, SITE).href;
      assert.equal(hash(await bytes(url, fetcher)), digest, `Stale/mixed public Pages asset: ${relative}${query}`);
    }
    verified.push(relative);
  }
  // Also verify the exact script URLs requested by both HTML entrypoints.
  for (const html of ['index.html','receptionist.html']) {
    const markup=fs.readFileSync(path.join(dir,html),'utf8');
    for (const match of markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
      const url=new URL(match[1],SITE);
      assert.equal(url.origin,new URL(SITE).origin);
      const relative=decodeURIComponent(url.pathname.slice(new URL(SITE).pathname.length));
      assert.ok(record.files[relative], `Unmanifested script: ${match[1]}`);
      assert.equal(hash(await bytes(url.href,fetcher)),record.files[relative],`Stale script URL: ${match[1]}`);
    }
  }
  return verified;
}
async function verifyRelease(record, fetcher=fetch, checkMetadata=true) {
 if(checkMetadata) {
  const metadata=JSON.parse(await bytes(`https://raw.githubusercontent.com/${REPO}/architecture-v2/latest-version.json?release=${record.sourceCommit}`,fetcher));
  for (const key of ['versionName','versionCode','sourceCommit','apkSha256','releaseTag'])
    assert.equal(metadata[key],record[key],`Updater mismatch: ${key}`);
  assert.equal(metadata.package,'com.zukait.timetrack');
 }
  const release=JSON.parse(await bytes(`https://api.github.com/repos/${REPO}/releases/latest`,fetcher));
  assert.equal(release.tag_name,record.releaseTag);
  assert.equal(release.draft,false);
  assert.equal(release.prerelease,false);
  const asset=release.assets.find(a=>a.name==='ZUKAIT_TIME_TRACK_LATEST.apk');
  const expected=`https://github.com/${REPO}/releases/download/${record.releaseTag}/ZUKAIT_TIME_TRACK_LATEST.apk`;
  assert.equal(asset?.browser_download_url,expected);
  assert.equal(hash(await bytes(expected,fetcher)),record.apkSha256,'Public APK differs from accepted signed bytes');
}
async function main() {
  const [mode,dir]=process.argv.slice(2);
  assert.ok(['manifest','pages','apk','release'].includes(mode), 'Expected manifest/pages/apk/release and site directory');
  if (mode==='manifest') {
    const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const record=manifest(dir,JSON.parse(fs.readFileSync('/tmp/zukait-approved-request.json','utf8')),sourceSha,fs.readFileSync('ZUKAIT_TIME_TRACK_LATEST.apk'));
    fs.writeFileSync(path.join(dir,'release-integrity.json'),JSON.stringify(record,null,2)+'\n');
    return;
  }
  const record=JSON.parse(fs.readFileSync(path.join(dir,'release-integrity.json'),'utf8'));
  const report={mode,sourceCommit:record.sourceCommit,checkedAt:new Date().toISOString(),passed:false};
  try {
    // Allow bounded propagation; retain failure rather than claiming publication.
    for(let attempt=1;attempt<=6;attempt++) {
      try {
        report.files=await verifyPages(record,dir);
        if(mode==='release'||mode==='apk') await verifyRelease(record,fetch,mode==='release');
        report.passed=true;
        break;
      } catch(e) {
        report.error=e.message;
        if(attempt===6) throw e;
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
    }
    delete report.error;
    console.log(`PASS: ${mode} delivery parity for ${record.sourceCommit}`);
  } finally {
    fs.writeFileSync(`coordinated-${mode}.json`,JSON.stringify(report,null,2)+'\n');
  }
}
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={hash,manifest,verifyPages,verifyRelease};
