import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const existing=fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8');
const mechanical=fs.readFileSync('app/src/main/assets/mechanical_consumables_ui.js','utf8');

assert.match(existing,/deptCard\('Mechanical Consumables','⚙️',true,'openMechanicalConsumables\(\)'\)/);
assert.match(existing,/deptCard\('Denting Consumables','🛠️',false/,'Denting availability remains unchanged');
assert.match(existing,/deptCard\('Painting Consumables','🎨',true/,'Painting remains unchanged');
assert.match(html,/mechanical_consumables_ui\.js\?v=/,'Mechanic module must load in web and Android assets');
assert.doesNotMatch(mechanical,/cloudScheduleSave|\bconsFinishIssue\b|\bfinishActual\b|zukait_save_workshop_state/,'menu must not reuse Painting data writes or large snapshot saves');

let output='',reads=0,writes=0;
const masterOpens=[],materialHistoryOpens=[];
const rows={innerHTML:''};
const input={value:''};
const matSelect={value:'p'};
const brandSelect={innerHTML:''};
const unitDisplay={textContent:''};
const data={consumables:{
 materials:[{id:'p',name:'2K Primer',unit:'Liter',active:true},
            {id:'t',name:'Masking Tape',unit:'Piece',active:true}],
 brands:[{id:'b',name:'CAPSI',active:true},{id:'m',name:'MILACO',active:true}],
 prices:[{materialId:'p',brandId:'b',pricePerUnit:5.5},{materialId:'p',brandId:'m',pricePerUnit:6.2}]
}};
const ctx={console,me:{id:'M',role:'Manager'},state:data,
 consOpenMaster:origin=>masterOpens.push(origin),
 consOpenMaterialSearch:origin=>materialHistoryOpens.push(origin),
 openModal:html=>{output=html},closeModal:()=>{},
 document:{getElementById:id=>id==='mcConsFilter'?input:id==='mcConsRows'?rows:id==='mcConsMaterial'?matSelect:id==='mcConsBrand'?brandSelect:id==='mcConsUnit'?unitDisplay:null}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(mechanical,ctx);
const keys=['issued','additional','returns','search','totals'];
ctx.openMechanicalConsumables();
assert.match(output,/Mechanical Consumables/);
for(const k of keys) assert.ok(output.includes("openMechanicalConsumablesSection('"+k+"')"),'missing '+k+' tile');
assert.match(output,/Brands &amp; Price/);
assert.match(output,/Search Material \/ Price History/);
ctx.openMechanicalConsumablesSection('master');
ctx.openMechanicalConsumablesSection('materialHistory');
assert.deepEqual(masterOpens,['mechanical']);
assert.deepEqual(materialHistoryOpens,['mechanical']);
ctx.openMechanicalConsumables();
assert.match(output,/Issued Materials/);
assert.doesNotMatch(output,/Suggested \/ Issued Materials/);
assert.match(output,/No separate Actual Materials or finalisation step/);
assert.ok(!output.includes("openMechanicalConsumablesSection('actual')"),'No Actual Materials screen');
assert.match(output,/Additional Materials/);
assert.match(output,/Return Materials/);
assert.match(output,/5W-30.*20W-40.*5W-40/);
assert.match(output,/WD-40/);
assert.match(output,/Coolant/);
assert.match(output,/Search Material List/);
assert.match(output,/Total Consumables/);
assert.doesNotMatch(output,/Coming soon/i,'Tile opens genuine Mechanical screen');
for(const key of keys){
  ctx.openMechanicalConsumablesSection(key);
  assert.match(output,/Mechanical Consumables/);
  assert.match(output,/openMechanicalConsumables\(\)/,'Each subpage can navigate back');
  if(key==='issued'||key==='additional') {
    assert.match(output,/Mechanical Job Card Number/);
    assert.match(output,/No material is issued or deducted from stock/);
    assert.match(output,/atomic stock deduction/);
    assert.match(output,/mcConsMaterial/);
    assert.match(output,/mcConsBrand/);
    assert.match(output,/CAPSI/);
    assert.match(output,/MILACO/);
  }
}
ctx.openMechanicalConsumablesSection('actual');
assert.ok(output.includes("openMechanicalConsumablesSection('issued')"),'Legacy Actual link returns to menu without saving');
ctx.openMechanicalConsumablesSection('returns');
assert.match(output,/audited reversal at the locked issue cost/);
assert.match(output,/Returns are not active yet/);
ctx.mechanicalConsumablesSelectMaterial();
assert.match(brandSelect.innerHTML,/CAPSI/);
assert.match(brandSelect.innerHTML,/MILACO/);
assert.match(unitDisplay.textContent,/Liter/);
ctx.openMechanicalConsumablesSection('search');
assert.match(rows.innerHTML,/2K Primer/);
assert.match(rows.innerHTML,/CAPSI/);
assert.match(rows.innerHTML,/Masking Tape/);
assert.match(rows.innerHTML,/Piece/);
input.value='cap';
ctx.mechanicalConsumablesFilter();
assert.match(rows.innerHTML,/CAPSI/);
assert.doesNotMatch(rows.innerHTML,/Masking Tape/);
ctx.openMechanicalConsumablesSection('totals');
assert.match(output,/cannot be calculated/);
const old=output;
ctx.me={id:'E',role:'Employee'};
ctx.openMechanicalConsumables();
assert.equal(output,old,'employees cannot open Mechanical consumables from the shared menu');
ctx.me={id:'S',role:'Supervisor'};
ctx.openMechanicalConsumables();
assert.match(output,/Mechanical Consumables/,'existing Supervisor can open tile');
assert.ok(!output.includes("openMechanicalConsumablesSection('master')"),'Supervisor must not see Manager master editor');
assert.ok(!output.includes("openMechanicalConsumablesSection('materialHistory')"),'Supervisor cannot edit price history');
ctx.openMechanicalConsumablesSection('master');
ctx.openMechanicalConsumablesSection('materialHistory');
assert.deepEqual(masterOpens,['mechanical'],'Supervisor never reaches material creation');
assert.deepEqual(materialHistoryOpens,['mechanical'],'Supervisor never reaches price editor');
assert.equal(writes,0);
assert.equal(reads,0);
assert.deepEqual(data.consumables.materials.map(x=>x.name),['2K Primer','Masking Tape']);
console.log('Mechanical consumables: Manager shared Brands & Price and history links, Supervisor role gates, issue/returns, multiple brands and Painting isolation: PASS');
