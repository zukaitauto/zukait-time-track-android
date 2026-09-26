import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const cloud=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const authority=fs.readFileSync('app/src/main/assets/live_status_authority.js','utf8');
const updates=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');

const stableTag=html.match(/<script src="supervisor_stable\.js\?v=\d+"><\/script>/);
const liveTag=html.match(/<script src="live_status_authority\.js\?v=\d+"><\/script>/);
assert.ok(stableTag && liveTag,'stable Supervisor and live authority scripts must ship');
assert.ok(html.indexOf(liveTag[0])>html.indexOf(stableTag[0]),'server live authority must load last');

assert.match(cloud,/action:'live_status'/,'cloud layer must call the server live-status endpoint');
assert.match(cloud,/livePollTimer=setTimeout/,'cloud layer must poll server live state independently with battery-aware scheduling');
assert.match(cloud,/if\(liveInFlight\|\|!sessionToken\(\)\|\|!navigator\.onLine\|\|!liveRole\(\)\)return false;/,'live poll must not be blocked by cloudDirty');
assert.match(cloud,/window\.zukaitServerLive=/,'cloud layer must publish authoritative rows');
assert.match(cloud,/r\.server_revision\|\|r\.revision/,'rebased saves must acknowledge the real server revision');
assert.match(cloud,/r\.data&&typeof r\.data==='object'/,'rebased saves must carry an authoritative merged snapshot');
assert.match(cloud,/normalizeRemote\(r\.data\)/,'client must apply the merged server snapshot immediately after a rebase');
assert.match(cloud,/r\.force_pull&&!r\.data/,'legacy-compatible rebase responses must force a refresh when no merged payload is present');
assert.match(authority,/window\.currentStaffStatuses=function/,'server authority must replace staff status reads');
assert.match(authority,/window\.currentActiveWorkers=function/,'server authority must replace active-worker reads');
assert.match(authority,/window\.openActiveWorkers=function/,'Active Workers details must use server rows');
assert.match(authority,/window\.v65OpenControl=function/,'Manager Working Now details must use server rows');
assert.match(authority,/if\(rr&&type==='working'\)return workerTable\(rr\.filter\(r=>r\.status==='Working'\|\|r\.status==='Overtime'\),'Working Now — Server Live'\)/,'Working Now popup must be built directly from the same server rows as its count');
assert.match(authority,/window\.openActiveWorkers=function\(\)[\s\S]*rr\.filter\(r=>ACTIVE\.has\(r\.status\)\)/,'Active Workers popup must be built directly from authoritative active rows');
assert.match(authority,/setCount\(root,'Working Now',working\)/,'Supervisor Working Now count must use the same authoritative server rows');
assert.match(updates,/Online shared dashboards are owned exclusively by live_status_authority\.js/,'legacy V115 worker counter must defer to SERVER LIVE authority');
assert.match(updates,/if\(window\.zukaitLiveStatusAuthority\)return;/,'online Manager\/Supervisor local worker counter must not overwrite server-live counts');

const listeners={};
const windowObj={
  me:{role:'Supervisor'},
  zukaitServerLive:{
    fresh:true,
    fetchedAt:Date.now(),
    revision:99,
    rows:[
      {employee_id:'EMP1',employee_name:'One',department:'Painter',status:'Working',job_no:'JC1',assignment_id:'A1',session_id:'S1',session_start:1000,suggested_minutes:60,vehicle:'Car',registration:'R1',overtime:false},
      {employee_id:'EMP2',employee_name:'Two',department:'Denter',status:'Paused',job_no:'JC2',assignment_id:'A2',session_id:'S2',session_start:900,suggested_minutes:45,vehicle:'SUV',registration:'R2',overtime:false},
      {employee_id:'EMP3',employee_name:'Three',department:'Mechanic',status:'ID001',job_no:'ID001',assignment_id:'A3',session_id:'S3',session_start:800,suggested_minutes:0,vehicle:'',registration:'',overtime:false},
      {employee_id:'EMP4',employee_name:'Four',department:'Painter',status:'Overtime',job_no:'JC4',assignment_id:'A4',session_id:'S4',session_start:700,suggested_minutes:120,vehicle:'Sedan',registration:'R4',overtime:true},
      {employee_id:'EMP5',employee_name:'Five',department:'Denter',status:'Available',job_no:null,assignment_id:null,session_id:null,session_start:null,suggested_minutes:0,vehicle:'',registration:'',overtime:false}
    ]
  },
  currentStaffStatuses:()=>[{emp:'LOCAL',status:'Available'}],
  currentStaffStatus:()=>({emp:'LOCAL',status:'Available'}),
  currentActiveWorkers:()=>[],
  v79CurrentWorkerRows:()=>[],
  v756UniqueActiveWorkerRows:()=>[],
  v84TechState:()=>({session:null,status:'Available'}),
  openModal:(html)=>{windowObj.lastModal=html;return html},
  showSupervisorModal:(title,body)=>{windowObj.lastModal=title+' '+body;return windowObj.lastModal},
  v65OpenControl:()=>{windowObj.legacyControl=true},
  openGlanceList:()=>{windowObj.legacyGlance=true},
  v74OT:()=>{windowObj.legacyOvertime=true},
  v92OpenAvailableWorkers:()=>{windowObj.legacyAvailable=true},
  addEventListener:(name,fn)=>{listeners[name]=fn}
};
const documentObj={
  hidden:false,
  addEventListener:()=>{},
  getElementById:()=>null,
  querySelectorAll:()=>[]
};
const context={
  window:windowObj,
  document:documentObj,
  navigator:{onLine:true},
  me:{role:'Supervisor'},
  Date,
  console,
  setInterval:()=>0,
  setTimeout:(fn)=>{fn();return 0}
};
vm.createContext(context);
vm.runInContext(authority,context);

const statuses=context.window.currentStaffStatuses();
assert.equal(statuses.length,5);
assert.equal(statuses.find(x=>x.emp==='EMP1').status,'Working');
assert.equal(context.window.currentStaffStatus('EMP2').status,'Paused');
const active=context.window.currentActiveWorkers();
assert.deepEqual(active.map(x=>x.u.id).sort(),['EMP1','EMP3','EMP4']);
assert.equal(context.window.v84TechState({id:'EMP3'}).status,'ID001');

context.window.v65OpenControl('working');
assert.match(context.window.lastModal,/One/); assert.match(context.window.lastModal,/Four/); assert.doesNotMatch(context.window.lastModal,/Two/);
context.window.v65OpenControl('waiting');
assert.match(context.window.lastModal,/Three/); assert.doesNotMatch(context.window.lastModal,/One/);
context.window.openGlanceList('paused');
assert.match(context.window.lastModal,/Two/); assert.doesNotMatch(context.window.lastModal,/Three/);
context.window.v74OT();
assert.match(context.window.lastModal,/Four/); assert.doesNotMatch(context.window.lastModal,/One/);
context.window.v92OpenAvailableWorkers();
assert.match(context.window.lastModal,/Five/); assert.doesNotMatch(context.window.lastModal,/Four/);
assert.equal(windowObj.legacyControl,undefined,'server-live Working/ID001 popups must not call legacy local control');
assert.equal(windowObj.legacyGlance,undefined,'server-live Paused popup must not call legacy local glance');
assert.equal(windowObj.legacyOvertime,undefined,'server-live Overtime popup must not call legacy local overtime');
assert.equal(windowObj.legacyAvailable,undefined,'server-live Available popup must not call legacy local available list');

context.window.zukaitServerLive.fetchedAt=Date.now()-8000;
assert.equal(context.window.currentStaffStatuses().length,0,'online stale server data must never fall back to local worker status');
assert.equal(context.window.currentStaffStatus('EMP1').status,'Unavailable','online stale server data must surface unavailable, not local activity');
assert.equal(context.window.currentActiveWorkers().length,0,'online stale server data must never invent active workers from cache');

context.navigator.onLine=false;
assert.equal(context.window.currentStaffStatuses()[0].emp,'LOCAL','offline mode may use local cache as a fallback');

assert.match(authority,/setTimeout\(apply,0\)/,'server live counts must be reapplied immediately after dashboard renders');

console.log('Server live-status authority tests passed: server counts/details, dirty-independent polling, no online stale fallback, offline-only cache fallback, and immediate render reapply');
