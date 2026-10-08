import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const listeners={};let renders=0,commits=0,syncs=0;
const state={sessions:[]};
const w={me:{id:'EMP1',role:'Employee'},zukaitCloud:{dirty:false,revision:5,syncNow(){syncs++}},
  renderEmployee(){renders++},v74Pause(){commits++;w.activeSession('EMP1').end=Date.now()},v74Finish(){commits++;const s=w.activeSession('EMP1');s.end=Date.now();s.finished=true},
  addEventListener(n,f){listeners[n]=f},v74Msg(){},render(){w.renderEmployee()}};
const c={window:w,state,me:w.me,navigator:{onLine:true},document:{hidden:false,addEventListener(){},getElementById(){return null},querySelectorAll(){return []}},Date,console,setTimeout(){return 0}};
vm.runInNewContext(fs.readFileSync('app/src/main/assets/live_status_authority.js','utf8'),c);
function live(status,revision=5,sid='S1',job='JC1'){
  w.zukaitServerLive={fresh:true,fetchedAt:Date.now(),revision,rows:[{employee_id:'EMP1',status,session_id:sid,job_no:job,session_start:100,assignment_id:'A1'}]};
}
live('Available');w.renderEmployee();
const s={id:'S1',emp:'EMP1',assignmentId:'A1',job:'JC1',start:100,end:null};state.sessions.push(s);w.zukaitCloud.dirty=true;
assert.equal(w.zukaitEmployeeDisplaySession('EMP1'),s,'queued Start must remain visible despite old Available row');
assert.equal(w.activeSession('EMP1'),s,'controls and display must resolve the identical mutable session');
listeners['zukait-live-status']();assert.equal(renders,2,'changed session must redraw employee controls');
listeners['zukait-live-status']();assert.equal(renders,2,'same session must not repeatedly redraw dashboard');
w.zukaitCloud.dirty=false;w.zukaitCloud.revision=6;
assert.equal(w.activeSession('EMP1'),s,'acknowledged Start wins over an older live revision');
live('Working',6);w.v74Pause();assert.ok(s.end,'Pause closes actual persisted session');
w.zukaitCloud.dirty=true;assert.equal(w.activeSession('EMP1'),null,'queued Pause hides old Working snapshot');
w.zukaitCloud.dirty=false;w.zukaitCloud.revision=7;assert.equal(w.activeSession('EMP1'),null,'acknowledged Pause cannot be resurrected by older poll');
const next={id:'S2',emp:'EMP1',assignmentId:'A2',job:'JC2',start:200,end:null};state.sessions.push(next);w.zukaitCloud.dirty=true;
assert.equal(w.activeSession('EMP1'),next,'another assigned job can run after closing the previous session');
live('Working',8,'S2','JC2');w.zukaitCloud.dirty=false;w.zukaitCloud.revision=8;
assert.equal(w.activeSession('EMP1'),next);
w.v74Finish();w.zukaitCloud.dirty=true;assert.equal(w.activeSession('EMP1'),null,'Finish closes persisted work before another Start');
const hold={id:'H1',emp:'EMP1',assignmentId:'AH',job:'ID001',start:300,end:null};state.sessions.push(hold);
assert.equal(w.activeSession('EMP1'),hold,'ID001 uses the same session authority and remains visible');
w.v74Finish();assert.equal(w.activeSession('EMP1'),null,'ID001 Stop closes persisted waiting work');
next.end=null;state.sessions.pop();w.zukaitCloud.dirty=false;
live('Available',9);assert.equal(w.activeSession('EMP1'),null,'fresh server stop from another phone wins');
live('Working',10,'REMOTE','JC3');assert.equal(w.activeSession('EMP1').id,'REMOTE','server-only session remains visible');
const before=commits;w.v74Finish();assert.equal(commits,before,'never finish a detached display object');assert.equal(syncs,1,'recover state before retrying');
w.zukaitServerLive.rows=[];assert.equal(w.activeSession('EMP1'),next,'partial rows do not erase known session');
c.navigator.onLine=false;assert.equal(w.activeSession('EMP1'),next,'offline fallback preserves controls');
console.log('Employee running session authority: passed');
