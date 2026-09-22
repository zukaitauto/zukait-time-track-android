import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const gradle = read('app/build.gradle');
const main = read('app/src/main/java/com/zukait/timetrack/MainActivity.java');
const updates = read('app/src/main/assets/v74_updates.js');
const metadata = JSON.parse(read('latest-version.json'));
const releaseWorkflow = read('.github/workflows/publish-approved-release.yml');

const versionCode = Number((gradle.match(/versionCode\s+(\d+)/)||[])[1]);
const versionName = (gradle.match(/versionName\s+['"]([^'"]+)['"]/ )||[])[1];
assert.equal(versionCode, 38, 'candidate Android versionCode must be 38');
assert.equal(versionName, 'V75', 'candidate Android versionName must be V75');
assert.match(main, /return BuildConfig\.VERSION_NAME;/, 'native bridge must report Gradle versionName');
assert.match(main, /return BuildConfig\.VERSION_CODE;/, 'native bridge must report Gradle versionCode');
assert.doesNotMatch(main, /getAppVersion\(\)[\s\S]{0,120}return "V74"/, 'native version name must not be hard-coded');
assert.ok(Number(metadata.versionCode) <= versionCode, 'published metadata cannot be newer than candidate build');
assert.equal(metadata.package, 'com.zukait.timetrack');

// Employee contracts
assert.match(updates, /openNormal=emp=>[\s\S]*?a\.job!==H[\s\S]*?!a\.cancelled[\s\S]*?!a\.completed/, 'normal open work must be detected');
assert.match(updates, /availableForIdeal=emp=>!activeSession\(emp\)&&openNormal\(emp\)\.length===0&&!openHold\(emp\)/, 'ID001 must only be available with no normal work');
assert.match(updates, /v75AssignIdealToAvailable/, 'bulk ID001 assignment must exist');
assert.match(updates, /idealSafeVersion:1/, 'safe ID001 version marker must be written');
assert.match(updates, /window\.v38CheckID001=function\(\)\{return false\}/, 'legacy ID001 auto-finish must be disabled');
assert.match(updates, /START \/ STOP only|START \/ STOP/, 'ID001 must remain start/stop only');
assert.match(updates, /<b>Overtime<\/b>/, 'Employee monthly dashboard must show Overtime');
assert.match(updates, /x\.job!==H[\s\S]*?sessionOvertimeMinutes/, 'ID001 must be excluded from monthly overtime');
assert.match(updates, /Final screenshot-style Employee dashboard/, 'stable Employee renderer must be the final standalone renderer');

// Supervisor contracts
assert.match(updates, /window\.v71ReopenSameAssignment=function/, 'Supervisor reopen-same flow must exist');
assert.match(updates, /previousCompletedAt:finishedAt/, 'reopen must preserve completion history');
assert.match(updates, /actualAtReopen:worked/, 'reopen must record retained actual time');
assert.match(updates, /openModal\('<div class="v74-d"><h2>↻ Reopen Same Assignment/, 'reopen must use in-app modal');

// Manager / whole-job contracts
assert.match(updates, /AA\(x\.no\)\.every\(a=>a\.completed\)/, 'Ready for Delivery requires all assignments complete');
assert.match(updates, /window\.labourCost=function\(a\)\{if\(isHoldAssignment\(a\)\)return 0;/, 'ID001 labour cost must be zero');

// Release/update contracts
assert.match(releaseWorkflow, /latest-version\.json/, 'approved release workflow must update published metadata');
assert.match(releaseWorkflow, /ZUKAIT_TIME_TRACK_LATEST\.apk/, 'approved release workflow must publish the stable update asset');
assert.match(releaseWorkflow, /apksigner.*verify|verify --verbose --print-certs/s, 'approved release must verify APK signature');

const H='ID001';
const activeSession=(state,emp)=>(state.sessions||[]).find(s=>s.emp===emp&&!s.end);
const openHold=(state,emp)=>(state.assign||[]).find(a=>a.job===H&&a.emp===emp&&!a.cancelled&&!a.completed);
const openNormal=(state,emp)=>(state.assign||[]).filter(a=>a.job!==H&&a.emp===emp&&!a.cancelled&&!a.completed);
const availableForIdeal=(state,emp)=>!activeSession(state,emp)&&openNormal(state,emp).length===0&&!openHold(state,emp);
const ready=(state,jobNo)=>{
  const rows=(state.assign||[]).filter(a=>a.job===jobNo&&!a.cancelled);
  return rows.length>0&&rows.every(a=>a.completed);
};
const actualFor=(state,id)=>(state.sessions||[]).filter(s=>s.assignmentId===id).reduce((n,s)=>n+Math.max(0,((s.end??s.start)-s.start)/60000),0);
const reopen=(state,id)=>{
  const a=state.assign.find(x=>x.id===id);
  const before={id:a.id,actual:actualFor(state,id),suggested:a.suggested,completedAt:a.completedAt};
  a.completed=false; delete a.completedAt; a.reopened=true;
  return before;
};

const base={assign:[],sessions:[]};
assert.equal(availableForIdeal(base,'E1'),true,'employee with no work is eligible for ID001');
const normalOpen={assign:[{id:'A1',job:'JC1',emp:'E1',completed:false,cancelled:false}],sessions:[]};
assert.equal(availableForIdeal(normalOpen,'E1'),false,'employee with open normal job is not eligible for ID001');
const active={assign:[],sessions:[{id:'S1',job:'JC1',emp:'E1',start:1,end:null}]};
assert.equal(availableForIdeal(active,'E1'),false,'employee with active work is not eligible for ID001');
const twoFree={assign:[],sessions:[]};
assert.equal(availableForIdeal(twoFree,'E1'),true);
assert.equal(availableForIdeal(twoFree,'E2'),true,'multiple free employees can receive ID001 simultaneously');

const multi={assign:[
  {id:'A1',job:'JC9',emp:'E1',completed:true,cancelled:false},
  {id:'A2',job:'JC9',emp:'E2',completed:false,cancelled:false}
],sessions:[]};
assert.equal(ready(multi,'JC9'),false,'whole job stays open while one employee is unfinished');
multi.assign[1].completed=true;
assert.equal(ready(multi,'JC9'),true,'whole job becomes ready only after all employees finish');

const reopenState={assign:[{id:'A3',job:'JC10',emp:'E3',suggested:120,completed:true,completedAt:5000}],sessions:[
  {id:'S3',assignmentId:'A3',job:'JC10',emp:'E3',start:0,end:3600000}
]};
const before=reopen(reopenState,'A3');
assert.equal(reopenState.assign[0].id,before.id,'reopen keeps same assignment id');
assert.equal(actualFor(reopenState,'A3'),before.actual,'reopen keeps previous actual time');
assert.equal(reopenState.assign[0].suggested,before.suggested,'reopen keeps allocated time');
assert.equal(reopenState.assign[0].completed,false,'reopen returns assignment to open state');

console.log('Functional smoke tests passed: Employee, ID001, Supervisor, Manager, update/release contracts.');
