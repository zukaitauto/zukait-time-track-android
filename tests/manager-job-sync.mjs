import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const source=fs.readFileSync('app/src/main/assets/cloud_sync.js','utf8');
const begin=source.indexOf('  async function managerJobEdit('),end=source.indexOf('  window.cloudScheduleSave=',begin);assert.ok(begin>0&&end>begin);
function setup(){
 let resolve;const response=new Promise(r=>resolve=r),calls=[],timers=[];
 const c={sessionEpoch:1,sessionToken:()=>c.token,token:'session-one',me:{id:'M',role:'Manager'},managerEditInFlight:false,cloudDirty:false,cloudPushing:false,dirtyGeneration:0,lastSyncedState:{jobs:[{no:'1',customer:'Original'}]},cloudRevision:5,pushTimer:null,
 stale:e=>e!==c.sessionEpoch,api:async body=>{calls.push(body);return response},pull:async force=>{assert.equal(force,true);c.pulled=true;return true},status:(...args)=>calls.push(args),warnPoll(){},clearTimeout(){},setTimeout:f=>{timers.push(f);return 1},push(){}};
 vm.createContext(c);vm.runInContext(source.slice(begin,end)+';this.edit=managerJobEdit',c);return {c,calls,resolve,timers};
}
{
 const h=setup(),before=JSON.stringify(h.c.lastSyncedState);const saving=h.c.edit({patch:{customer:'Corrected'}});
 assert.equal(JSON.stringify(h.c.lastSyncedState),before,'no optimistic shared state');
 await assert.rejects(h.c.edit({}),/SYNC_PENDING/,'double submit blocked');
 h.resolve({ok:true,server_revision:6,job:{no:'1',customer:'Corrected'}});assert.equal((await saving).refresh_pending,false);
 assert.equal(h.c.lastSyncedState,null);assert.equal(h.c.cloudRevision,5,'receipt never labels old state as newer');assert.equal(h.c.dirtyGeneration,1);assert.equal(h.c.managerEditInFlight,false);
}
{
 const h=setup(),saving=h.c.edit({});h.c.cloudDirty=true;h.c.dirtyGeneration++;h.resolve({ok:true,data:{jobs:[]},server_revision:6});
 assert.equal((await saving).refresh_pending,true);assert.equal(h.c.pulled,undefined,'new local edits never overwritten by mutation response or forced refresh');assert.equal(h.c.cloudDirty,true);assert.equal(h.timers.length,1,'queued save resumes after command');
}
{
 const h=setup();h.c.pull=async()=>{throw Error('temporary outage')};const saving=h.c.edit({});h.resolve({ok:true,server_revision:6});assert.equal((await saving).refresh_pending,true,'confirmed save is not reported as rejected when refresh fails');
}
{
 const h=setup(),before=h.c.lastSyncedState,saving=h.c.edit({});h.resolve({ok:false,code:'job_edit_conflict'});assert.equal((await saving).code,'job_edit_conflict');assert.equal(h.c.lastSyncedState,before);assert.equal(h.c.dirtyGeneration,0);
}
{
 const h=setup(),saving=h.c.edit({});h.c.sessionEpoch++;h.c.token='new-account';h.c.lastSyncedState={newAccount:true};h.c.managerEditInFlight=false;h.resolve({ok:true,job:{no:'1'}});await assert.rejects(saving,/STALE_SESSION/);assert.equal(h.c.lastSyncedState.newAccount,true);assert.equal(h.c.pulled,undefined);
}
for(const flag of ['cloudDirty','cloudPushing']){const h=setup();h.c[flag]=true;await assert.rejects(h.c.edit({}),/SYNC_PENDING/);assert.equal(h.calls.length,0)}
{const h=setup();h.c.me.role='Supervisor';await assert.rejects(h.c.edit({}),/manager_required/);assert.equal(h.calls.length,0)}
// Exercise the actual client merge on overlapping server corrections and local edits.
const mergeStart=source.indexOf('  function same('),mergeEnd=source.indexOf('  function mergeById(',mergeStart);assert.ok(mergeEnd>mergeStart);
const c={clone:structuredClone,window:{}};vm.createContext(c);vm.runInContext(source.slice(mergeStart,mergeEnd)+';this.merge=threeWayMerge',c);
const base={jobs:[{no:'1',customer:'Original',reg:'OLD'},{no:'2',notes:'Before'}],sessions:[]};
const remote=structuredClone(base);remote.jobs[0].customer='Server corrected';remote.jobs.push({no:'3',reg:'NEW'});
const local=structuredClone(base);local.jobs[1].notes='Local note';let merged=c.merge(base,remote,local);
assert.equal(merged.jobs[0].customer,'Server corrected');assert.equal(merged.jobs[1].notes,'Local note');assert.equal(merged.jobs[2].no,'3');
local.jobs[0].reg='LOCAL';merged=c.merge(base,remote,local);assert.equal(merged.jobs[0].customer,'Server corrected');assert.equal(merged.jobs[0].reg,'LOCAL');assert.equal(base.jobs[0].customer,'Original');
// Real editor must preserve local job, allocation and audit state until confirmation.
const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
w.state={jobs:[{no:'1',make:'Toyota',model:'Camry',reg:'AA',jobType:'Cash',createdAt:Date.parse('2026-11-01T08:00:00+04:00'),customer:'Existing',intakeOdometer:123,notes:'',jobNotes:'Old note',workDescription:'',description:'Old description',customerAddress:'',address:'Old address'}],assign:[],sessions:[],jobEdits:[{id:'prior'}]};
w.me={id:'M',role:'Manager'};w.users=[];w.zukaitAuth={getToken:()=> 'one'};w.formatVehicleName=x=>x;w.openModal=html=>w.document.getElementById('modal').innerHTML=html;w.closeModal=()=>{};w.alert=()=>{};w.render=()=>{};
w.eval(fs.readFileSync('app/src/main/assets/manager_job_edit.js','utf8'));w.editJobManager('1');for(const key of ['notes','workDescription','customerAddress'])assert.equal(w.document.getElementById('mje-'+key).value,'',key+' remains explicitly cleared');w.document.getElementById('mje-customer').value='Corrected';w.document.getElementById('mje-reason').value='Correction';
let reject;w.zukaitCloud={managerJobEdit:()=>new Promise((_,r)=>reject=r)};const before=JSON.stringify(w.state),saving=w.zukaitSaveManagerFullEdit();assert.equal(JSON.stringify(w.state),before);
w.state.jobEdits.push({id:'newer-unrelated'});reject(Error('server rejected'));await saving;assert.equal(w.state.jobs[0].customer,'Existing');assert.equal(w.state.jobEdits.at(-1).id,'newer-unrelated','failed correction cannot roll back unrelated audit data');dom.window.close();
console.log('PASS Manager command sync: no optimistic edits, pending/double-submit guards, receipt vs snapshot, outage, account switch, job-keyed merge and failed-edit audit preservation.');

const pushStart=source.indexOf('  async function push(retry=0)'),pushEnd=source.indexOf('  // Manager corrections are online commands',pushStart);
const blocked={sessionEpoch:1,cloudPushing:false,managerEditInFlight:true,cloudDirty:true};vm.createContext(blocked);vm.runInContext(source.slice(pushStart,pushEnd)+';this.send=push',blocked);assert.equal(await blocked.send(),false,'ordinary snapshot saves serialize behind Manager correction');
// Full cloud module + real editor: confirmation must refresh and persist shared data.
{
 const dom=new JSDOM('<div id="legacyAppHeader"></div><div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
 w.setTimeout=()=>1;w.clearTimeout=()=>{};w.alert=m=>{throw Error(m)};w.formatVehicleName=x=>x;
 w.openModal=html=>w.document.getElementById('modal').innerHTML=html;w.closeModal=()=>{};w.render=()=>{};w.zukaitAuth={getToken:()=> 'manager-session'};
 w.eval("var KEY='qa-cache',me={id:'M',role:'Manager'},users=[],state={jobs:[],assign:[],sessions:[]};");
 let server={jobs:[{no:'1',make:'Toyota',model:'Camry',vehicle:'Toyota Camry',reg:'AA',jobType:'Cash',createdAt:Date.parse('2026-11-01T08:00:00+04:00'),customer:'Existing',customerName:'Existing',jobIntakeOdometer:123}],assign:[],sessions:[]},revision=5,finish;
 const requests=[];w.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);let result;
  if(body.action==='manager_job_full_edit'){
   await new Promise(r=>finish=r);
   server={...server,jobs:[{...server.jobs[0],...body.patch,editRevision:1}],jobEdits:[{by:'M',reason:body.reason}]};revision++;
   result={ok:true,job:structuredClone(server.jobs[0]),server_revision:revision};
  }else if(body.action==='load'){result={ok:true,revision,data:structuredClone(server)}}else throw Error('Unexpected action '+body.action);
  return {status:200,ok:true,headers:{get:()=>null},json:async()=>result};
 };
 w.eval(source);w.eval(fs.readFileSync('app/src/main/assets/job_card_master.js','utf8'));w.eval(fs.readFileSync('app/src/main/assets/manager_job_edit.js','utf8'));
 await w.zukaitCloud.pull(true);w.editJobManager('1');w.document.getElementById('mje-customer').value='Corrected';w.document.getElementById('mje-reason').value='Confirmed correction';
 const saving=w.zukaitSaveManagerFullEdit();assert.equal(w.zukaitCloud.syncHealth.correcting,true);assert.equal(w.state.jobs[0].customer,'Existing');assert.equal(JSON.parse(w.localStorage.getItem('qa-cache')).jobs[0].customer,'Existing');finish();await saving;
 assert.equal(w.zukaitCloud.syncHealth.correcting,false);assert.equal(w.state.jobs[0].customer,'Corrected');assert.equal(w.zukaitCloud.revision,6);assert.equal(JSON.parse(w.localStorage.getItem('qa-cache')).jobs[0].customer,'Corrected');assert.equal(w.state.jobEdits[0].reason,'Confirmed correction');assert.equal(w.zukaitCloud.dirty,false);
 assert.deepEqual(requests.map(r=>r.action),['load','manager_job_full_edit','load']);assert.equal(requests.at(-1).known_revision,undefined,'post-command refresh cannot reuse an old conditional baseline');
 w.zukaitCloud.stop();dom.window.close();
}
console.log('PASS real editor/cloud integration: server confirmation, unconditional full refresh, shared identity, revision and durable cache agree.');
