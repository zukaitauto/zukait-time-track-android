import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<form><label>Make<input name="make"></label><label>Model<input name="model"></label><input name="vin" value="VIN unchanged"><input name="registration" value="12345-M"><input name="customer" value="Existing customer"></form>',{runScripts:'outside-only'});
const {window}=dom,doc=window.document;
for(const name of ['vehicle_index.js','vehicle_index_autocomplete.js'])window.eval(fs.readFileSync('app/src/main/assets/'+name,'utf8'));
const seed=JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_pilot.json','utf8'));
const index=window.zukaitVehicleIndex.create(seed),ui=window.zukaitVehicleAutocomplete,form=doc.querySelector('form'),make=form.elements.make,model=form.elements.model;
assert.equal(ui.attach(form),null,'disabled without explicitly configured catalogue');
ui.configure(index);
const panels=ui.attach(form);
assert.equal(ui.attach(form),panels,'no duplicate widgets');
let inputs=0;form.addEventListener('input',()=>inputs++);
const enter=(field,text)=>{field.value=text;field.dispatchEvent(new window.Event('input',{bubbles:true}))};
enter(make,'n');
assert.equal(panels.makePanel.textContent,'Nissan');
panels.makePanel.querySelector('button').click();
assert.equal(make.value,'Nissan');
enter(model,'p');
assert.equal(panels.modelPanel.textContent,'Patrol');
panels.modelPanel.querySelector('button').click();
assert.equal(model.value,'Patrol');
assert.equal(form.elements.vin.value,'VIN unchanged');
assert.equal(form.elements.registration.value,'12345-M');
assert.equal(form.elements.customer.value,'Existing customer');
enter(make,'t');panels.makePanel.querySelector('button').click();
assert.equal(model.value,'Patrol','explicit make changes do not silently erase model text');
assert.match(panels.modelPanel.nextElementSibling.textContent,/Check the model/);
enter(model,'land');
assert.match(panels.modelPanel.textContent,/Land Cruiser/);
make.value='Nissan';model.value='pat';model.dispatchEvent(new window.Event('focus'));
assert.equal(panels.modelPanel.textContent,'Patrol','programmatic vehicle lookup cannot leave a stale make filter');
enter(model,'unknown custom model');assert.equal(model.value,'unknown custom model');assert.equal(panels.modelPanel.hidden,true);
assert.match(panels.modelPanel.nextElementSibling.textContent,/Not in the catalogue/);
assert.ok(inputs>0);
const before=new window.FormData(form);assert.deepEqual([...before.keys()],['make','model','vin','registration','customer']);
const reception=fs.readFileSync('app/src/main/assets/v2/features/insurance/reception.js','utf8');
assert.equal((reception.match(/zukaitVehicleAutocomplete\?\.attach\?\.\(form\)/g)||[]).length,2);
for(const name of ['offline_test.html','receptionist.html','mechanical_supervisor.html','mechanical_estimate.html']){
 const host=fs.readFileSync('app/src/main/assets/'+name,'utf8');
 const ordered=['vehicle_index.js','vehicle_index_autocomplete.js','vehicle_index_bootstrap.js','vehicle_index_loader.js','vehicle_index_qa_sync.js'];
 let last=-1;
 for(const file of ordered){const marker='src="'+file+'?';assert.equal(host.split(marker).length-1,1,name+' loads '+file+' once');const pos=host.indexOf(marker);assert.ok(pos>last,name+' script dependency order');last=pos;}
 assert.doesNotMatch(host,/omqgkqknbdcnotabffek/,'staff host must not point to QA');
}
// Verify the exact deployed bundle instead of merely checking that scripts exist.
const staffWindow=new JSDOM('<form><input name="make" value="Nissan"><input name="model"></form>',{runScripts:'outside-only'}).window;
for(const name of ['vehicle_index.js','vehicle_index_autocomplete.js','vehicle_index_bootstrap.js'])staffWindow.eval(fs.readFileSync('app/src/main/assets/'+name,'utf8'));
assert.equal(staffWindow.ZUKAIT_VEHICLE_INDEX_READY,true);
const reviewed=JSON.parse(fs.readFileSync('app/src/main/assets/vehicle_index_reviewed.json','utf8'));
assert.equal(JSON.stringify(staffWindow.zukaitVehicleIndexBase),JSON.stringify(staffWindow.zukaitVehicleIndex.validate(reviewed)));
const sf=staffWindow.document.querySelector('form'),sa=staffWindow.zukaitVehicleAutocomplete.attach(sf);
assert.ok(sa);sf.elements.model.value='Pat';sf.elements.model.dispatchEvent(new staffWindow.Event('input',{bubbles:true}));
assert.ok([...sa.modelPanel.querySelectorAll('button')].some(b=>b.textContent==='Patrol'));
console.log('Vehicle autocomplete: explicit selection, scoped models, identity preservation, manual fallback, staff host initialization passed');
// Chromium can dispatch focusout synchronously while a focused suggestion is removed.
// Closing the same panel again must not re-enter replaceChildren during that removal.
function verifyBlurDuringRemoval(panel,target,trigger){
 const replace=panel.replaceChildren.bind(panel),errors=[];let removing=false;
 const onError=e=>{errors.push(e.error);e.preventDefault()};window.addEventListener('error',onError);
 panel.replaceChildren=(...children)=>{
  if(removing)throw Error('Suggestion removal re-entered during blur');
  removing=true;try{target.dispatchEvent(new window.FocusEvent('focusout',{bubbles:true,relatedTarget:null}));return replace(...children)}finally{removing=false}
 };
 try{trigger();assert.deepEqual(errors,[],'Removing focused suggestions must not recursively clear the panel')}
 finally{panel.replaceChildren=replace;window.removeEventListener('error',onError)}
}
enter(make,'Nis');verifyBlurDuringRemoval(panels.makePanel,form,()=>enter(make,'Nis'));
const blurHost=doc.createElement('div'),blurField=doc.createElement('input');blurHost.appendChild(blurField);doc.body.appendChild(blurHost);
const blurUI=ui.attachCombined(blurField);blurField.value='Nis';blurField.dispatchEvent(new window.Event('input'));
verifyBlurDuringRemoval(blurUI.panel,blurHost,()=>blurField.dispatchEvent(new window.Event('input')));
console.log('Vehicle suggestions: synchronous blur during removal cannot re-enter panel clearing');

const section=doc.createElement('section');
section.innerHTML='<label>Make<input id="custom-make" value="Nissan"></label><label>Model<input id="custom-model"></label><input id="other" value="untouched">';
doc.body.append(section);
const customMake=section.querySelector('#custom-make'),customModel=section.querySelector('#custom-model');
const customPanels=ui.attach(section,index,{make:customMake,model:customModel});
assert.ok(customPanels);
enter(customModel,'p');
const stale=customPanels.modelPanel.querySelector('button');
customMake.value='Toyota';stale.click();
assert.equal(customModel.value,'p','stale model choice after programmatic make change is rejected');
customMake.value='Nissan';enter(customModel,'p');customModel.readOnly=true;
customPanels.modelPanel.querySelector('button').click();
assert.equal(customModel.value,'p','read-only fields cannot be modified');
customModel.readOnly=false;enter(customModel,'p');
customPanels.modelPanel.querySelector('button').click();
assert.equal(customModel.value,'Patrol');
assert.equal(section.querySelector('#other').value,'untouched');
const locked=doc.createElement('form');locked.innerHTML='<label><input name="make" readonly></label><label><input name="model"></label>';doc.body.append(locked);
assert.equal(ui.attach(locked,index),null);
for(const file of ['job_card_edit.js','manager_job_edit.js','mechanical_prejob_intake.js'])assert.match(fs.readFileSync('app/src/main/assets/'+file,'utf8'),/zukaitVehicleAutocomplete\?\.attach\?\./);

const estimateForm=doc.createElement('div');estimateForm.innerHTML='<label>Make & Model<input id="combined"></label><input id="linked-job"><input id="estimate-vin" value="untouched">';doc.body.append(estimateForm);
const combinedField=estimateForm.querySelector('#combined'),linked=estimateForm.querySelector('#linked-job');
const combinedUI=ui.attachCombined(combinedField,()=>!linked.value,index);
enter(combinedField,'n');assert.equal(combinedUI.panel.textContent,'Nissan');combinedUI.panel.querySelector('button').click();
assert.equal(combinedField.value,'Nissan ');
enter(combinedField,'Nissan p');assert.equal(combinedUI.panel.textContent,'Patrol');combinedUI.panel.querySelector('button').click();
assert.equal(combinedField.value,'Nissan Patrol');
assert.equal(estimateForm.querySelector('#estimate-vin').value,'untouched');
enter(combinedField,'Toyota land');const oldChoice=combinedUI.panel.querySelector('button');linked.value='JC123';oldChoice.click();assert.equal(combinedField.value,'Toyota land','linked estimate selection is rejected');
linked.value='';enter(combinedField,'Toyota land');const outdated=combinedUI.panel.querySelector('button');combinedField.value='Nissan Patrol';outdated.click();assert.equal(combinedField.value,'Nissan Patrol','stale estimate option cannot overwrite a programmatic lookup');
combinedField.readOnly=true;enter(combinedField,'n');assert.equal(combinedUI.panel.hidden,true);
assert.match(fs.readFileSync('app/src/main/assets/mechanical_sections.js','utf8'),/zukaitVehicleAutocomplete\?\.attach\?\.\(form\)/);
assert.match(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'),/zukaitVehicleAutocomplete\?\.attachCombined\?\./);
