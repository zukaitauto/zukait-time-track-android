// QA-only generated source. Never modify the checked-out production hosts or publish.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const QA='omqgkqknbdcnotabffek',PROD='pjknotnjkufadqavcmii';
const qaKey=process.env.ZUKAIT_VEHICLE_QA_PUBLISHABLE_KEY;
const prodKey='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A';
if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(qaKey||'')||qaKey===prodKey)throw Error('QA publishable key required');
const dir=mkdtempSync(join(tmpdir(),'zukait-vehicle-index-qa-'));
try{
 const tar=join(dir,'source.tar');
 execFileSync('git',['archive','--format=tar','--output='+tar,'HEAD']);execFileSync('tar',['-xf',tar,'-C',dir]);rmSync(tar);
 const assets=join(dir,'app/src/main/assets'),origin='https://'+QA+'.supabase.co';
 const base=require(join(assets,'vehicle_index.js')).validate(JSON.parse(readFileSync(join(assets,'vehicle_index_reviewed.json'),'utf8')));
 if(base.version!==3||base.makes.length!==29||base.models.length!==294||base.aliases.length!==0)throw Error('unexpected reviewed QA base');
 const hosts=['offline_test.html','receptionist.html','mechanical_supervisor.html','mechanical_estimate.html'];
 const boot='vehicle_index_qa_bootstrap.js';
 // Synchronous embedded data for Android WebView and web: no fetch/polling or database access.
 const literal=JSON.stringify(base).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 writeFileSync(join(assets,boot),'(function(){try{const data='+literal+';window.zukaitVehicleAutocomplete.configure(window.zukaitVehicleIndex.create(data));window.ZUKAIT_VEHICLE_INDEX_QA_READY=true;}catch(e){console.warn("QA catalogue unavailable",e);}})();\n');
 function walk(path){for(const entry of readdirSync(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:html?|m?js|json|css|txt|webmanifest|svg|map)$/i.test(entry.name)){
  let s=readFileSync(file,'utf8');
  // Rewrite every known production backend reference, including isolated Mechanical hosts.
  const next=s.replaceAll(PROD,QA).replaceAll(prodKey,qaKey);
  if(next!==s)writeFileSync(file,next);
 }}}
 walk(assets);
 for(const host of [...hosts,'accountant.html']){
  const file=join(assets,host);let s=readFileSync(file,'utf8');
  if(!/<head(?:\s[^>]*)?>/i.test(s))throw Error('missing head '+host);
  const policy='<meta http-equiv="Content-Security-Policy" content="connect-src \'self\' '+origin+'; form-action \'self\'; frame-src \'self\' blob: data:; object-src \'none\'">';
  const scripts=hosts.includes(host)?'<script src="vehicle_index.js?v=qa3"></script><script src="vehicle_index_autocomplete.js?v=qa3"></script><script src="'+boot+'"></script>':'';
  s=s.replace(/<head(?:\s[^>]*)?>/i,m=>m+policy+scripts);writeFileSync(file,s);
 }
 function edit(path,fn){const file=join(dir,path),s=readFileSync(file,'utf8'),next=fn(s);if(next===s)throw Error('expected QA edit missing '+path);writeFileSync(file,next);}
 function once(s,a,b){if(s.split(a).length!==2)throw Error('unexpected QA edit '+a);return s.replace(a,()=>b);}
 edit('app/build.gradle',s=>once(once(s,"applicationId 'com.zukait.timetrack'","applicationId 'com.zukait.timetrack.vehicleqa'"),'versionName "V425"','versionName "V425-vehicle-qa"'));
 edit('app/src/main/AndroidManifest.xml',s=>once(once(s,'android:label="Zukait Time Track"','android:label="Zukait Vehicle QA"'),'    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',''));
 edit('app/src/main/java/com/zukait/timetrack/MainActivity.java',s=>{
  s=once(s,'checkForUpdatesNative();','// QA: no release update check.');
  const re=/runOnUiThread\(\(\) -> startUpdateDownloadNative\(\)\);/g;if([...s.matchAll(re)].length!==2)throw Error('unexpected updater entry points');s=s.replace(re,'// QA: updater disabled.');
  s=once(s,'runOnUiThread(() -> requestInstallAfterCloudSync());','// QA: release install disabled.');
  return s;
 });
 for(const host of hosts){const s=readFileSync(join(assets,host),'utf8');if(!s.includes('connect-src \'self\' '+origin)||!s.includes(boot)||s.includes(PROD))throw Error('unsafe QA host '+host);}
 console.log(dir);
}catch(e){rmSync(dir,{recursive:true,force:true});throw e;}
