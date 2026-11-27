import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const assets='app/src/main/assets';
const html=fs.readFileSync(path.join(assets,'offline_test.html'),'utf8');
const refs=[...html.matchAll(/<script[^>]+src=["']([^"']+)/g)].map(m=>m[1].split('?')[0]);
for(const ref of refs){
  assert.ok(!ref.startsWith('/')&&!ref.includes('..'),`unexpected script path: ${ref}`);
  assert.ok(fs.statSync(path.join(assets,ref)).size>0,`missing shipped script: ${ref}`);
}
if(!process.argv.includes('--source-only')){
  for(const ref of ['app/src/main/assets/zukait_logo.webp','app/src/main/res/drawable/app_icon.webp','app/src/main/res/drawable/app_logo.webp','app/src/main/res/drawable/splash_screen.xml','app/src/main/res/values/styles.xml']){
    assert.ok(fs.statSync(ref).size>0,`missing production asset: ${ref}`);
  }
}
for(const ref of ['honda.svg','ford.svg','chevrolet.svg','gmc.svg','cadillac.svg'])assert.ok(fs.statSync(path.join(assets,'vehicle-logos',ref)).size>0);
console.log(`Production script assets checked: ${refs.length}${process.argv.includes('--source-only')?' (binary asset check omitted in text-only workspace)':''}`);
