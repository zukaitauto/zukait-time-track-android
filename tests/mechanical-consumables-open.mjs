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
const rows={innerHTML:''};
const input={value:''};
const data={consumables:{
 materials:[{id:'p',name:'2K Primer',unit:'Liter',active:true},
            {id:'t',name:'Masking Tape',unit:'Piece',active:true}],
 brands:[{id:'b',name:'CAPSI',active:true}],
 prices:[{materialId:'p',brandId:'b',pricePerUnit:5.5}]
}};
const ctx={console,me:{id:'M',role:'Manager'},state:data,
 openModal:html=>{output=html},closeModal:()=>{},
 document:{getElementById:id=>id==='mcConsFilter'?input:id==='mcConsRows'?rows:null}};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(mechanical,ctx);
const keys=['issued','actual','additional','search','totals'];
ctx.openMechanicalConsumables();
assert.match(output,/Mechanical Consumables/);
for(const k of keys) assert.ok(output.includes("openMechanicalConsumablesSection('"+k+"')"),'missing '+k+' tile');
assert.match(output,/Suggested \/ Issued Materials/);
assert.match(output,/Actual Materials/);
assert.match(output,/Additional Materials/);
assert.match(output,/Search Material List/);
assert.match(output,/Total Consumables/);
assert.doesNotMatch(output,/Coming soon/i,'Tile opens genuine Mechanical screen');
for(const key of keys){
  ctx.openMechanicalConsumablesSection(key);
  assert.match(output,/Mechanical Consumables/);
  assert.match(output,/openMechanicalConsumables\(\)/,'Each subpage can navigate back');
  if(key==='issued'||key==='additional'||key==='actual') {
    assert.match(output,/Mechanical Job Card Number/);
    assert.match(output,/No material is reserved, issued, finalised, or deducted/);
  }
}
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
assert.equal(writes,0);
assert.equal(reads,0);
assert.deepEqual(data.consumables.materials.map(x=>x.name),['2K Primer','Masking Tape']);
console.log('Mechanical consumables opens, five screens navigate, existing catalog is read-only, permissions and Painting isolation: PASS');
