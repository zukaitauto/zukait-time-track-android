import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
const manager=fs.readFileSync('app/src/main/assets/v67_updates.js','utf8');
assert.doesNotMatch(manager,/controlCard\('paused'/);
assert.match(manager,/disabled aria-disabled="true"><span>Delivered Vehicles<\/span><small>/);
for(const role of ['Manager','Supervisor']){
 let click,modal='',fresh=true,statuses=[];
 const document={addEventListener(type,fn){if(type==='click')click=fn},createElement(){return{}},head:{appendChild(){}},body:{}};
 const context={window:{currentStaffStatuses:()=>statuses,zukaitLiveStatusAuthority:{fresh:()=>fresh},openModal:html=>modal=html},document,navigator:{onLine:true},me:{role},state:{jobs:[],assign:[{job:'JC1',completed:true},{job:'JC2',cancelled:true}],leaves:[]},users:[{id:'EMP1',name:'One',department:'Painter'}],MutationObserver:class{observe(){}},setTimeout(){},setInterval(){}};
 vm.runInNewContext(source,context);
 const open=()=>click({target:{closest:()=>({dataset:{workshopAction:'paused'}})}});
 for(const status of ['Paused','Working','Available','Paused']){
  statuses=[{emp:'EMP1',status,job:'JC3'}];
  assert.equal(context.window.zukaitWorkshopOverview.summary().paused,status==='Paused'?1:0);
  open();assert.equal((modal.match(/class="wo-status-row /g)||[]).length,status==='Paused'?1:0);
 }
 fresh=false;assert.equal(context.window.zukaitWorkshopOverview.summary().paused,null);open();assert.match(modal,/syncing/);assert.doesNotMatch(modal,/wo-status-row/);
}
console.log('Pause menu count/list transitions and stale-server handling passed for Manager and Supervisor; lower placeholder has no count or action.');
