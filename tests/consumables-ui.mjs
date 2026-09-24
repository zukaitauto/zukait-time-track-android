import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../app/src/main/assets/consumables.js');
const elements=new Map(),alerts=[],prompts=[];
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){}}});return elements.get(id)};
let tile=null;
const parent={classList:{add(){}}};
const available={textContent:'AVAILABLE WORKERS',parentElement:parent,closest(){return this},insertAdjacentElement(position,card){tile=card}};
const host={querySelector(){return tile},querySelectorAll(selector){return selector.startsWith('.cons-launch')?[]:[available]}};
const state={jobs:[{no:'JC1',vehicle:'Toyota Camry',make:'Toyota',model:'Camry',year:2020,reg:'REG1',status:'Open'},{no:'ID001'}],assign:[{job:'JC1',emp:'P1',assignedBy:'S1'}]};
const ctx={state,users:[{id:'P1',name:'Painter',department:'Painter'},{id:'S1',name:'Supervisor',role:'Supervisor'}],me:{id:'M1',role:'Manager'},ZukaitConsumables:C,console,
 document:{head:{appendChild(){}},createElement(){return {}},getElementById(id){if(id==='supervisorView')return host;if(id==='managerView')return null;return element(id)},querySelectorAll(){return element('consActualRows').innerHTML.match(/value="([^"]*)"/g)?.map(x=>({value:x.slice(7,-1)}))||[]}},
 alert:x=>alerts.push(x),prompt:()=>prompts.length?prompts.shift():'Verified correction',confirm:()=>true,setTimeout:fn=>fn(),render(){},save(){ctx.saved=JSON.stringify(state)},closeModal(){},openModal(html){ctx.modal=html}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext('let me=window.me; delete window.me;',ctx);
vm.runInContext(fs.readFileSync('app/src/main/assets/consumables_ui.js','utf8'),ctx);
const fill=values=>Object.entries(values).forEach(([id,value])=>element(id).value=value);
fill({cmMaterial:'Primer',cmBrand:'Brand',cmUnit:'Litre',cmPrice:'3.5',cmDate:'2020-01-01'});
ctx.consSaveMaster();assert.equal(state.consumables.materials.length,1);assert.equal(state.consumables.brands.length,1);assert.match(element('cmList').innerHTML,/OMR 3.500/);assert.doesNotMatch(element('cmList').innerHTML,/NaN/);
const m=state.consumables.materials[0],b=state.consumables.brands[0];
vm.runInContext("me={id:'S1',role:'Supervisor'}",ctx);ctx.render();assert.equal(tile.className,'cons-supervisor-tile');ctx.render();assert.ok(tile);
ctx.openConsumablesEntry('issued');fill({consJc:'REG1'});ctx.consFindJC('issued');assert.match(element('consJcResults').innerHTML,/JC1/);assert.match(element('consJcResults').innerHTML,/REG1/);ctx.consSelectJC('JC1');assert.match(element('consVehicleDetails').innerHTML,/Toyota Camry/);assert.match(element('consVehicleDetails').innerHTML,/REG1/);assert.match(element('consVehicleDetails').innerHTML,/2020/);
for(const [type,quantity] of [['issued','2'],['additional','0.5']]){
 ctx.openConsumablesEntry(type);fill({consJc:'JC1'});ctx.consLoadJC(type);fill({consMaterial:m.id,consBrand:b.id,consQty:quantity,consPainter:'P1'});ctx.consAddLine();ctx.consFinishIssue();
}
assert.equal(state.consumables.issues.length,2);
ctx.openConsumablesActual();fill({consActualJc:'JC1'});ctx.consLoadActual();assert.match(element('consActualRows').innerHTML,/Primer/);assert.match(element('consActualRows').innerHTML,/max="2.5"/);assert.match(element('consActualRows').innerHTML,/value="2.5"/);
element('consActualRows').innerHTML=element('consActualRows').innerHTML.replace('value="2.5"','value="2.25"');ctx.consFinishActual();assert.equal(state.consumables.actuals.length,0);assert.match(ctx.modal,/FINAL CHECK BEFORE LOCKING/);assert.match(ctx.modal,/OMR 7.875/);ctx.consConfirmFinishActual();assert.equal(state.consumables.actuals.length,1);assert.equal(state.consumables.actuals[0].totalCost,7.875);assert.equal(state.consumables.actuals[0].createdBy,'S1');
fill({consSearchJc:'JC1'});ctx.consShowSearch();assert.match(element('consSearchResult').innerHTML,/2.5 Litre/);assert.match(element('consSearchResult').innerHTML,/2.25 Litre/);assert.doesNotMatch(element('consSearchResult').innerHTML,/\[object Object\]|undefined/);
vm.runInContext("me={id:'M1',role:'Manager'}",ctx);ctx.consRunReports();assert.match(element('crResult').innerHTML,/2.25 Litre/);assert.match(element('crResult').innerHTML,/OMR 7.875/);
fill({csmMaterial:m.id});ctx.consMaterialHistory();assert.match(element('csmResult').innerHTML,/OMR 3.500/);assert.doesNotMatch(element('csmResult').innerHTML,/NaN/);
const before=JSON.stringify(state);prompts.push(null);assert.doesNotThrow(()=>ctx.consHistoryCorrectActual(state.consumables.actuals[0].id));assert.equal(JSON.stringify(state),before);
assert.throws(()=>C.managerCorrectActual(state,state.consumables.actuals[0].id,[{materialId:m.id,brandId:b.id,quantity:1}],vm.runInContext('me',ctx),''),/REASON_REQUIRED/);assert.equal(JSON.stringify(state),before);
assert.throws(()=>C.managerCorrectIssue(state,state.consumables.issues[0].id,{colourCode:'changed'},vm.runInContext('me',ctx),''),/REASON_REQUIRED/);assert.equal(JSON.stringify(state),before);
fill({consActualJc:'bad'});ctx.consLoadActual();assert.equal(element('consActualVehicle').value,'');
ctx.openConsumablesModule();assert.match(ctx.modal,/disabled[^>]*><span>🛠️/);
assert.ok(ctx.saved);assert.ok(!alerts.includes('MANAGER_ONLY'));console.log('Consumables UI integration tests passed: Job Card picker/vehicle details, sticky summary source, duplicate safeguards, final Actual review, actor audit, search, reports and supervisor tile');

