import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
const dir=execFileSync(process.execPath,['scripts/prepare-vehicle-index-qa.mjs'],{encoding:'utf8'}).trim();
try{
 const assets=join(dir,'app/src/main/assets'),read=file=>readFileSync(join(assets,file),'utf8');
 for(const host of ['offline_test.html','receptionist.html','mechanical_supervisor.html','mechanical_estimate.html']){
  const s=read(host);assert.match(s,/vehicle_index_qa_bootstrap\.js/);assert.match(s,/connect-src 'self' https:\/\/omqgkqknbdcnotabffek\.supabase\.co/);
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
 assert.match(readFileSync(join(dir,'app/build.gradle'),'utf8'),/com\.zukait\.timetrack\.vehicleqa/);
 assert.doesNotMatch(readFileSync(join(dir,'app/src/main/AndroidManifest.xml'),'utf8'),/REQUEST_INSTALL_PACKAGES/);
 console.log('QA source: pinned bundle, isolated hosts, separate APK and actual autocomplete adapter passed');
}finally{rmSync(dir,{recursive:true,force:true});}
