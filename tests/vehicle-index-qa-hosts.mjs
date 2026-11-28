import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
const dir=execFileSync(process.execPath,['scripts/prepare-vehicle-index-qa.mjs'],{encoding:'utf8'}).trim();
try{
 const assets=join(dir,'app/src/main/assets'),read=file=>readFileSync(join(assets,file),'utf8');
 for(const host of ['offline_test.html','receptionist.html','mechanical_supervisor.html','mechanical_estimate.html']){
  const s=read(host);assert.match(s,/vehicle_index_qa_bootstrap\.js/);assert.match(s,/vehicle_index_qa_sync\.js/);assert.match(s,/connect-src 'self' https:\/\/omqgkqknbdcnotabffek\.supabase\.co/);
 }
 for(const file of ['cloud_sync.js','secure_auth.js','receptionist_session.js','mechanical_supervisor.js','mechanical_estimate_host.js']){
  assert.ok(read(file).includes('omqgkqknbdcnotabffek'));assert.ok(!read(file).includes('pjknotnjkufadqavcmii'));
 }
 const dom=new JSDOM('<form><label>Make<input name="make"></label><label>Model<input name="model"></label><input name="vin" value="untouched"></form>',{runScripts:'outside-only'}),win=dom.window;
 for(const file of ['vehicle_index.js','vehicle_index_autocomplete.js','vehicle_index_qa_bootstrap.js'])win.eval(read(file));
 assert.equal(win.ZUKAIT_VEHICLE_INDEX_QA_READY,true);
 const form=win.document.querySelector('form'),adapter=win.zukaitVehicleAutocomplete.attach(form);
 const enter=(field,value)=>{field.value=value;field.dispatchEvent(new win.Event('input',{bubbles:true}))};
 enter(form.elements.make,'n');const n=[...adapter.makePanel.querySelectorAll('button')].find(x=>x.textContent==='Nissan');assert.ok(n);n.click();
 enter(form.elements.model,'p');const p=[...adapter.modelPanel.querySelectorAll('button')].find(x=>x.textContent==='Patrol');assert.ok(p);p.click();assert.equal(form.elements.model.value,'Patrol');assert.equal(form.elements.vin.value,'untouched');
 // Already-mounted autocomplete must see newly approved models without rebuilding a form.
 for(const file of ['vehicle_index_loader.js','vehicle_index_qa_sync.js'])win.eval(read(file));
 let active=true,reads=0;
 const approved={ok:true,baseVersion:5,version:6,changes:[{version:6,id:'local:sync-test',kind:'ADD_MODEL',name:'QA New Model',makeId:'make:nissan',requestId:'sync-test',approvedBy:'M1',approvedAt:'2026-11-28T00:00:00Z'}]};
 assert.equal(await win.zukaitVehicleIndexQaSync.start({read:async()=>{reads++;return approved},isCurrent:()=>active}),true);
 enter(form.elements.model,'QA New');assert.ok([...adapter.modelPanel.querySelectorAll('button')].some(x=>x.textContent==='QA New Model'));
 win.dispatchEvent(new win.Event('focus'));await new Promise(r=>setTimeout(r,0));assert.equal(reads,1);
 active=false;win.dispatchEvent(new win.Event('focus'));enter(form.elements.model,'QA New');assert.equal(adapter.modelPanel.querySelectorAll('button').length,0);
 let resolveOld;active=true;const pending=win.zukaitVehicleIndexQaSync.start({read:()=>new Promise(r=>{resolveOld=r}),isCurrent:()=>active});
 win.zukaitVehicleIndexQaSync.reset();resolveOld(approved);assert.equal(await pending,false);enter(form.elements.model,'QA New');assert.equal(adapter.modelPanel.querySelectorAll('button').length,0);
 assert.match(readFileSync(join(dir,'app/build.gradle'),'utf8'),/com\.zukait\.timetrack\.vehicleqa/);
 assert.doesNotMatch(readFileSync(join(dir,'app/src/main/AndroidManifest.xml'),'utf8'),/REQUEST_INSTALL_PACKAGES/);

 assert.match(read('offline_test.html'),/vehicle_index_qa_manager_host\.js/);
 assert.doesNotMatch(read('receptionist.html'),/vehicle_index_qa_manager_host\.js/);
 const dashboard=new JSDOM('<div id="managerView"><div class="manager-actions"></div></div><div id="modal"></div>',{runScripts:'outside-only'}),w=dashboard.window;
 for(const file of ['vehicle_index.js','vehicle_index_autocomplete.js','vehicle_index_qa_bootstrap.js','vehicle_index_loader.js','vehicle_index_review.js','vehicle_index_manager.js'])w.eval(read(file));
 let token='test-token',calls=0;w.me={id:'M1',role:'Manager'};w.zukaitAuth={getToken:()=>token};w.openModal=s=>w.document.querySelector('#modal').innerHTML=s;
 w.zukaitCloud={vehicleIndexRequest:async body=>{calls++;assert.equal(body.action,'vehicle_index_read');return {ok:true,baseVersion:5,version:5,changes:[]}}};
 w.eval(read('vehicle_index_qa_manager_host.js'));w.zukaitVehicleIndexQaHost.install();w.zukaitVehicleIndexQaHost.install();
 assert.equal(w.document.querySelectorAll('[data-vehicle-index-qa-menu]').length,1);assert.equal(calls,0);
 await w.zukaitVehicleIndexQaHost.open();assert.equal(calls,1);assert.match(w.document.querySelector('#modal').textContent,/51 makes · 429 models/);assert.match(w.document.querySelector('#modal').textContent,/New vehicle names/);
 w.me={id:'S1',role:'Supervisor'};w.zukaitVehicleIndexQaHost.install();assert.equal(w.document.querySelectorAll('[data-vehicle-index-qa-menu]').length,0);await w.zukaitVehicleIndexQaHost.open();assert.equal(calls,1);
 console.log('QA source: pinned bundle, isolated hosts, separate APK, autocomplete and authenticated Manager entry passed');
}finally{rmSync(dir,{recursive:true,force:true});}
