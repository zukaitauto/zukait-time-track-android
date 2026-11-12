import assert from 'node:assert/strict';
import {loadApi,fixture,clone,TEST_NOW as now} from './helpers/workshop-api.mjs';
const original=fixture();
const {helpers}=loadApi({state:original});
const valid=next=>helpers.validateEmployeeChange('E1',original,next);
const active={id:'s1',assignmentId:'a1',job:'JC1',emp:'E1',start:now-3600000,end:null,paused:false,finished:false,rework:false};
let started=clone(original);started.sessions.push(active);
assert.equal(valid(started),true,'normal Start');
let paused=clone(started);Object.assign(paused.sessions[0],{end:now,paused:true});paused.assign[0].pauseReason='Parts waiting';
assert.equal(helpers.validateEmployeeChange('E1',started,paused),true,'Pause keeps the assignment open');
let resumed=clone(paused);resumed.sessions.push({...active,id:'s2',start:now});
assert.equal(helpers.validateEmployeeChange('E1',paused,resumed),true,'Resume creates the next session');
let finished=clone(started);Object.assign(finished.sessions[0],{end:now,finished:true});Object.assign(finished.assign[0],{completed:true,completedAt:now});Object.assign(finished.jobs[0],{status:'Completed',completedAt:now});
assert.equal(helpers.validateEmployeeChange('E1',started,finished),true,'Finish derives job completion');
let offline=clone(started);offline.offlineActionLog.push({id:'off-start',type:'START',assignmentId:'a1',sessionId:'s1',emp:'E1',job:'JC1',at:active.start});offline.assign[0].pendingOfflineStart=true;
assert.equal(valid(offline),true,'offline Start log is accepted');
let offPause=clone(offline);Object.assign(offPause.sessions[0],{end:now,paused:true});offPause.offlineActionLog.push({id:'off-pause',type:'PAUSE',assignmentId:'a1',emp:'E1',job:'JC1',at:now});
assert.equal(helpers.validateEmployeeChange('E1',offline,offPause),true,'offline Pause log is accepted');
let offFinish=clone(finished);offFinish.offlineActionLog.push({id:'off-finish',type:'FINISH',assignmentId:'a1',sessionId:'s1',emp:'E1',job:'JC1',at:now});
assert.equal(helpers.validateEmployeeChange('E1',started,offFinish),true,'offline Finish is accepted');
let leave=clone(original);leave.leaves.push({id:'l1',emp:'E1',by:'E1',date:'2026-10-10',period:'AM',cancelled:false});leave.leaveAudit.push({id:'la1',leaveId:'l1',by:'E1',action:'ADD'});leave.leaveNotifications.push({id:'ln1',leaveId:'l1',emp:'E1',by:'E1'});leave.requests.push({id:'lr1',emp:'E1',status:'New',type:'leave_notice',leaveId:'l1'});
assert.equal(valid(leave),true,'employee Leave and its notifications');
for(const patch of [
  s=>s.sessions[0].assignmentId='missing',s=>s.sessions[0].job='NOT_ASSIGNED',s=>s.sessions[0].start=1,
  s=>s.sessions[0].start=now+3600000,s=>s.sessions[0].end=active.start-1,
  s=>s.sessions.push({...active,id:'duplicate-active'}),s=>s.sessions[0].emp='E2'
]){const forged=clone(started);patch(forged);assert.equal(valid(forged),false,'invalid Start rejected');}
let rewritten=clone(finished);rewritten.sessions[0].end+=1;
assert.equal(helpers.validateEmployeeChange('E1',finished,rewritten),false,'closed time is immutable to employee');
rewritten=clone(finished);rewritten.sessions[0].end=null;
assert.equal(helpers.validateEmployeeChange('E1',finished,rewritten),false,'closed session cannot be reopened');
let blocked=clone(original);blocked.leaves.push({id:'on-leave',emp:'E1',date:'2026-10-08',period:'AM'});
let workOnLeave=clone(blocked);workOnLeave.sessions.push(active);
assert.equal(helpers.validateEmployeeChange('E1',blocked,workOnLeave),false,'Start on leave rejected');
let hold=clone(original);hold.jobs.push({no:'ID001',status:'Open'});hold.assign.push({id:'h1',emp:'E1',job:'ID001',suggested:60,idealSafeVersion:1,assignedAt:active.start-1000,completed:false,rework:false});
let holdStart=clone(hold);holdStart.sessions.push({...active,id:'hs1',assignmentId:'h1',job:'ID001'});
assert.equal(helpers.validateEmployeeChange('E1',hold,holdStart),true,'ID001 Start');
let stop=clone(holdStart);Object.assign(stop.sessions[0],{end:now,finished:true});Object.assign(stop.assign[1],{completed:true,completedAt:now});
assert.equal(helpers.validateEmployeeChange('E1',holdStart,stop),true,'ID001 Stop');
let switched=clone(stop);switched.sessions.push({...active,start:now});
assert.equal(helpers.validateEmployeeChange('E1',holdStart,switched),true,'ID001 stop followed by normal Start');
let holiday=clone(hold);holiday.workshopHolidays=['2026-10-08'];let holidayStart=clone(holiday);holidayStart.sessions=clone(holdStart.sessions);
assert.equal(helpers.validateEmployeeChange('E1',holiday,holidayStart),false,'ID001 blocked on public holiday');
let newAssignment=clone(original);newAssignment.assign.push({...original.assign[0],id:'a2',emp:'E2',job:'JC1'});
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},original,newAssignment),true,'Supervisor assignment');
let additional=clone(original);additional.assign[0].suggested+=30;additional.additionalActions=[{id:'add1',by:'S1',assignmentId:'a1',minutes:30}];
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},original,additional),true,'Supervisor additional time');
for(const patch of [s=>s.users[0].role='Manager',s=>s.workshopHolidays.push('2026-10-10'),s=>s.consumables.prices.push({id:'p1',pricePerUnit:1}),s=>s.corrections=[{by:'S1'}]]){
 const forbidden=clone(original);patch(forbidden);assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},original,forbidden),false,'Supervisor Manager-only change rejected');
}
let supervisorRewrite=clone(finished);supervisorRewrite.sessions[0].end+=10;
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},finished,supervisorRewrite),false,'Supervisor cannot change closed hours');
let managerCorrection=clone(finished);managerCorrection.sessions[0].end+=10;managerCorrection.corrections=[{by:'M1',reason:'Test correction',oldEnd:now,newEnd:now+10}];
assert.equal(helpers.validateRoleChange({id:'M1',role:'Manager'},finished,managerCorrection),true,'Manager correction workflow retained');
let eraseAudit=clone(managerCorrection);eraseAudit.corrections=[];
assert.equal(helpers.validateRoleChange({id:'M1',role:'Manager'},managerCorrection,eraseAudit),false,'existing audit cannot be erased');
const save=await loadApi({state:original}).request({action:'save',expected_revision:4,data:offline});
assert.equal(save.status,200);assert.equal(save.body.ok,true,'offline action reaches commit through full API');
assert.deepEqual(original,fixture(),'validations do not mutate stored fixture');
console.log('Review server workflows: Start/Pause/Resume/Finish, offline, ID001, Leave, Supervisor and Manager guards passed');
// Preserve supported material, repeat/reopen, vehicle-correction and legacy-history workflows.
const legacy=fixture();legacy.sessions=[{id:'historical-anomaly',emp:'E2',job:'OLD_DELETED_JOB',start:1,end:2}];
const unchangedHistory=clone(legacy);unchangedHistory.requests.push({id:'request-own',emp:'E1',status:'New',type:'more_time'});
assert.equal(helpers.validateEmployeeChange('E1',legacy,unchangedHistory),true,'unchanged legacy history is grandfathered');
assert.deepEqual(legacy.sessions,[{id:'historical-anomaly',emp:'E2',job:'OLD_DELETED_JOB',start:1,end:2}]);
let reopened=clone(finished);reopened.assign[0].completed=false;delete reopened.assign[0].completedAt;reopened.jobs[0].status='Open';delete reopened.jobs[0].completedAt;reopened.reopenLogs=[{id:'reopen1',by:'S1',assignmentId:'a1'}];
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},finished,reopened),true,'Supervisor reopens assignment without rewriting sessions');
let repeat=clone(finished);repeat.assign.push({...original.assign[0],id:'repeat1',rework:true,mistakeEmp:'E2'});repeat.jobs[0].status='Open';repeat.jobs[0].delivered=false;delete repeat.jobs[0].completedAt;repeat.reworkLogs=[{id:'repeat-audit',by:'S1'}];
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},finished,repeat),true,'Supervisor Repeat Work');
let vehicle=clone(original);Object.assign(vehicle.jobs[0],{vehicle:'Test Make Model',make:'Test Make',brand:'Test Make',model:'Model',year:'2020',reg:'TEST'});
vehicle.jobVehicleEdits=[{job:'JC1',by:'S1',before:{vehicle:'Test Car',reg:''},after:{vehicle:'Test Make Model',make:'Test Make',model:'Model',year:'2020',reg:'TEST'}}];
assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},original,vehicle),true,'audited Supervisor vehicle correction');
let deleteJob=clone(original);deleteJob.jobs=[];assert.equal(helpers.validateRoleChange({id:'S1',role:'Supervisor'},original,deleteJob),false,'Supervisor cannot delete jobs');
const {createRequire}=await import('node:module');const C=createRequire(import.meta.url)('../app/src/main/assets/consumables.js');
let materialState=fixture();const actor={id:'M1',role:'Manager'},sup={id:'S1',role:'Supervisor'};
const material=C.addMaterial(materialState,{name:'Test Material',unit:'Liter',category:'Consumable'},actor);const brand=C.addBrand(materialState,{name:'Test Brand'},actor);
C.setPrice(materialState,{materialId:material.id,brandId:brand.id,pricePerUnit:2,effectiveFrom:1,reason:'Test price'},actor);
let issued=clone(materialState);C.issue(issued,{jobCard:'JC1',lines:[{materialId:material.id,brandId:brand.id,quantity:2}]},sup);
assert.equal(helpers.validateRoleChange(sup,materialState,issued),true,'Supervisor consumable issue');
let actual=clone(issued);C.finishActual(actual,{jobCard:'JC1',lines:[{materialId:material.id,brandId:brand.id,quantity:1}]},sup);
assert.equal(helpers.validateRoleChange(sup,issued,actual),true,'Supervisor consumable finalization');
let corrected=clone(actual);C.managerCorrectActual(corrected,corrected.consumables.actuals[0].id,[{materialId:material.id,brandId:brand.id,quantity:0.5}],actor,'Test correction');
assert.equal(helpers.validateRoleChange(actor,actual,corrected),true,'Manager audited material correction');
assert.equal(helpers.validateRoleChange(sup,actual,corrected),false,'Supervisor cannot perform Manager material correction');
console.log('Review workflow compatibility: legacy history, reopen/repeat, audited vehicle edit and real consumables operations passed');
