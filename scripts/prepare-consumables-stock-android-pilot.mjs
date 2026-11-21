import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRef = process.env.ZUKAIT_STOCK_PILOT_PROJECT_REF || '';
const publishableKey = process.env.ZUKAIT_STOCK_PILOT_PUBLISHABLE_KEY || '';
if (!/^[a-z]{20}$/.test(projectRef) || projectRef === 'pjknotnjkufadqavcmii') {
  throw new Error('Set ZUKAIT_STOCK_PILOT_PROJECT_REF to an isolated Supabase project.');
}
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
  throw new Error('Set ZUKAIT_STOCK_PILOT_PUBLISHABLE_KEY to the matching publishable key.');
}

const origin = `https://${projectRef}.supabase.co`;
const directory = mkdtempSync(join(tmpdir(), 'zukait-stock-android-'));
try {
  const archive = join(directory, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', '--output=' + archive, 'HEAD'], { stdio: 'inherit' });
  execFileSync('tar', ['-xf', archive, '-C', directory], { stdio: 'inherit' });
  rmSync(archive);

  function edit(path, replacements) {
    const file = join(directory, path);
    let content = readFileSync(file, 'utf8');
    for (const [expected, replacement, count = 1] of replacements) {
      if (content.split(expected).length !== count + 1) {
        throw new Error(`Unexpected number of matches for a pilot edit in ${path}.`);
      }
      content = content.replace(expected, () => replacement);
    }
    writeFileSync(file, content);
  }

  const assets = 'app/src/main/assets';
  const productionOrigin = 'https://pjknotnjkufadqavcmii.supabase.co';
  edit(`${assets}/secure_auth.js`, [
    [`const AUTH_URL='${productionOrigin}/functions/v1/staff-auth';`, `const AUTH_URL='${origin}/functions/v1/staff-auth';`],
    [/const PUBLISHABLE_KEY='sb_publishable_[A-Za-z0-9_-]+';/g, `const PUBLISHABLE_KEY='${publishableKey}';`]
  ]);
  edit(`${assets}/cloud_sync.js`, [
    [`const API_URL='${productionOrigin}/functions/v1/workshop-api';`, `const API_URL='${origin}/functions/v1/workshop-api';`],
    [/const CLOUD_KEY='sb_publishable_[A-Za-z0-9_-]+';/g, `const CLOUD_KEY='${publishableKey}';`]
  ]);
  edit(`${assets}/offline_test.html`, [
    [/<head>/gi, `<head>\n<meta http-equiv="Content-Security-Policy" content="connect-src 'self' ${origin}; form-action 'self'">`]
  ]);
  edit('app/build.gradle', [
    ["applicationId 'com.zukait.timetrack'", "applicationId 'com.zukait.timetrack.stockpilot'"]
  ]);
  edit('app/src/main/AndroidManifest.xml', [
    ['android:label="Zukait Time Track"', 'android:label="Zukait Stock Pilot"']
  ]);
  edit('app/src/main/java/com/zukait/timetrack/MainActivity.java', [
    ['/assets/offline_test.html?v=124"', '/assets/offline_test.html?v=124&stockPilot=1"'],
    ['checkForUpdatesNative();', '// Release updates are disabled in the stock pilot.'],
    [/runOnUiThread\(\(\) -> startUpdateDownloadNative\(\)\);/g, '// Release updates are disabled in the stock pilot.', 2],
    ['runOnUiThread(() -> requestInstallAfterCloudSync());', '// Release updates are disabled in the stock pilot.']
  ]);

  console.log(directory);
} catch (error) {
  rmSync(directory, { recursive: true, force: true });
  throw error;
}
