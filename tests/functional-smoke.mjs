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
assert.match(main, /getPackageInfo\(getPackageName\(\), 0\)/, 'native bridge must read the installed APK package info');
assert.match(main, /return installedVersionName\(\);/, 'native bridge must report installed versionName');
assert.match(main, /return installedVersionCode\(\);/, 'native bridge must report installed versionCode');
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

assert.match(updates, /V75\.2 HOLIDAY \+ ID001 RUNTIME AUTHORITY/, 'V75.2 runtime authority must be present');
assert.match(updates, /getDay\(\)===5/, 'Friday must always be treated as a workshop holiday');
assert.match(updates, /state\.workshopHolidays/, 'manager public-holiday state must exist');
assert.match(updates, /v75OpenPublicHolidays/, 'Manager Admin public holiday control must exist');
assert.match(updates, /ID001 can run only during duty hours: 08:00–13:00 and 15:00–19:00/, 'ID001 start must be blocked outside duty hours');
assert.match(updates, /stopID001AtDutyEnd/, 'active ID001 must stop at the duty boundary');
assert.match(updates, /window\.monthlyIdealTimeMinutes=idealGapMinutes/, 'Ideal Time must use gaps between sessions, not ID001 duration');
assert.match(updates, /window\.overtimeForEmployee=.*overtimeMinutes/s, 'holiday-aware overtime must be authoritative');

// V75.3 ID001 report / manual-start contracts
assert.match(updates, /V75\.3 ID001 REPORT \+ TIME BREAKDOWN/, 'V75.3 ID001 report runtime must be present');
assert.match(updates, /window\.v753ManualStartOnly=true/, 'manual-start-only contract marker must be present');
assert.equal((updates.match(/state\.sessions\.push\s*\(/g)||[]).length,1,'candidate update layer must create sessions only from the explicit Start flow');
assert.match(updates, /finishedDone=done\.filter\(a=>a\.job!==H\)/, 'Employee Finished Jobs must exclude ID001');
assert.match(updates, /v753OpenID001Report/, 'Supervisor/Manager ID001 report must exist');
assert.match(updates, /v753From/, 'ID001 report must include From date filter');
assert.match(updates, /v753To/, 'ID001 report must include To date filter');
assert.match(updates, /Total Actual Working/, 'Employee dashboard must show Total Actual Working');
assert.match(updates, /Productive Actual/, 'Employee dashboard must show Productive Actual separately');
assert.match(updates, /ID001 Time/, 'Employee dashboard must show ID001 Time separately');
assert.match(updates, /ID001 DETAILS \/ HOURS/, 'Supervisor/Manager dashboards must expose the ID001 report control');

// Native dialog contract: no WebView URL banner should be shown to users.
assert.match(main, /boolean onJsAlert\(WebView view, String url, String message, JsResult result\)/, 'Android wrapper must intercept JavaScript alerts');
assert.match(main, /boolean onJsConfirm\(WebView view, String url, String message, JsResult result\)/, 'Android wrapper must intercept JavaScript confirms');
assert.match(main, /boolean onJsPrompt\(WebView view, String url, String message, String defaultValue, JsPromptResult result\)/, 'Android wrapper must intercept JavaScript prompts');
assert.match(main, /setTitle\("Zukait Time Track"\)/, 'native JavaScript dialogs must use app branding');
assert.match(main, /text\.startsWith\("Request sent to Supervisor"\)/, 'request-sent success should use a native toast instead of a blocking browser alert');

// V75.4 final runtime contracts
assert.match(updates, /v75NormalAssignmentAvailableMinutes/, 'Ideal Time must use actual normal-work availability');
assert.match(updates, /a\.job!==previousJob/, 'Ideal Time must require other normal work, not just the paused/finished job itself');
assert.match(updates, /v754ReconcileID001Globally/, 'ID001 duty-end reconciliation must run globally for any role/device');
assert.match(updates, /setInterval\(reconcileID001Globally,15000\)/, 'global ID001 reconciliation timer must be present');
assert.match(updates, /v42AfterCloudPull=function/, 'ID001 reconciliation must run after cloud pulls');
assert.match(updates, /cells\.some\(v=>v===HOLD/, 'legacy finished/production cleanup must inspect all table cells');
assert.match(updates, /v753ReportFilter/, 'ID001 report must preserve selected date filters');
assert.match(updates, /v753OpenID001Report\(true\)/, 'ID001 employee-detail Back must preserve filters');
assert.match(updates, /window\.v753SaveReportFilter/, 'date-filter callback must be globally accessible to inline controls');
assert.match(updates, /window\.v754FinalRuntimeFixes=true/, 'final runtime fix marker must be present');




// Supervisor contracts
assert.match(updates, /window\.v71ReopenSameAssignment=function/, 'Supervisor reopen-same flow must exist');
assert.match(updates, /previousCompletedAt:finishedAt/, 'reopen must preserve completion history');
assert.match(updates, /actualAtReopen:worked/, 'reopen must record retained actual time');
assert.match(updates, /openModal\('<div class="v74-d"><h2>↻ Reopen Same Assignment/, 'reopen must use in-app modal');
assert.match(updates, /j\.status='Open';delete j\.completedAt/, 'reopen must reset parent Job Card status and completion date');

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


// Holiday / duty-time contracts
const dateKey=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const dayStart=ts=>{const d=new Date(ts);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime()};
const declared=new Set(['2026-11-18']);
const closedDay=ts=>new Date(ts).getDay()===5||declared.has(dateKey(ts));
const dutyWindow=ts=>{
  if(closedDay(ts))return null;
  const d=new Date(ts),m=d.getHours()*60+d.getMinutes(),ds=dayStart(ts);
  if(m>=480&&m<780)return {start:ds+480*60000,end:ds+780*60000};
  if(m>=900&&m<1140)return {start:ds+900*60000,end:ds+1140*60000};
  return null;
};
const normalMinutes=(start,end)=>{
  let total=0,cur=start;
  while(cur<end){
    const ds=dayStart(cur),de=ds+86400000,se=Math.min(end,de);
    if(!closedDay(cur)){
      for(const [a,b] of [[480,780],[900,1140]]) total+=Math.max(0,(Math.min(se,ds+b*60000)-Math.max(cur,ds+a*60000))/60000);
    }
    cur=de;
  }
  return total;
};
const overtimeMinutes=(start,end)=>{
  let total=0,cur=start;
  while(cur<end){
    const ds=dayStart(cur),de=ds+86400000,se=Math.min(end,de);
    if(closedDay(cur)) total+=(se-cur)/60000;
    else {
      total+=Math.max(0,(Math.min(se,ds+900*60000)-Math.max(cur,ds+780*60000))/60000);
      total+=Math.max(0,(se-Math.max(cur,ds+1140*60000))/60000);
    }
    cur=de;
  }
  return total;
};

const workingMorning=new Date(2026,8,21,10,0).getTime(); // Monday
const lunch=new Date(2026,8,21,14,0).getTime();
const fridayMorning=new Date(2026,8,25,10,0).getTime();
const publicHolidayMorning=new Date(2026,10,18,10,0).getTime();
assert.ok(dutyWindow(workingMorning), 'ID001 must be allowed inside normal duty time');
assert.equal(dutyWindow(lunch),null,'ID001 must be blocked during the 13:00–15:00 break');
assert.equal(dutyWindow(fridayMorning),null,'ID001 must be blocked all Friday');
assert.equal(dutyWindow(publicHolidayMorning),null,'ID001 must be blocked on manager-declared public holidays');

const friStart=new Date(2026,8,25,9,0).getTime(),friEnd=new Date(2026,8,25,11,0).getTime();
assert.equal(normalMinutes(friStart,friEnd),0,'Friday work must have zero normal minutes');
assert.equal(Math.round(overtimeMinutes(friStart,friEnd)),120,'Friday work must be 100% overtime');
const holStart=new Date(2026,10,18,9,0).getTime(),holEnd=new Date(2026,10,18,11,30).getTime();
assert.equal(normalMinutes(holStart,holEnd),0,'public-holiday work must have zero normal minutes');
assert.equal(Math.round(overtimeMinutes(holStart,holEnd)),150,'public-holiday work must be 100% overtime');

const idealGap=(sessions,from,to)=>{
  const rows=sessions.map(x=>({start:Math.max(x.start,from),end:Math.min(x.end,to)})).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
  let sum=0,lastEnd=null;
  for(const x of rows){if(lastEnd!==null&&x.start>lastEnd)sum+=normalMinutes(lastEnd,x.start);lastEnd=lastEnd===null?x.end:Math.max(lastEnd,x.end)}
  return sum;
};
const day=new Date(2026,8,21,0,0).getTime();
assert.equal(Math.round(idealGap([{start:day+8*3600000,end:day+9*3600000},{start:day+9.5*3600000,end:day+10*3600000}],day,day+86400000)),30,'Ideal Time must count only the duty-hour gap between sessions');
assert.equal(Math.round(idealGap([{start:day+8*3600000,end:day+9*3600000},{start:day+9*3600000,end:day+9.5*3600000},{start:day+9.5*3600000,end:day+10*3600000}],day,day+86400000)),0,'ID001/waiting session occupying the gap must prevent Ideal Time');

const reopenJobState={jobs:[{no:'JC10',status:'Completed',completedAt:5000}],assign:[{id:'A3',job:'JC10',emp:'E3',completed:true,completedAt:5000}]};
reopenJobState.assign[0].completed=false; delete reopenJobState.assign[0].completedAt;
reopenJobState.jobs[0].status='Open'; delete reopenJobState.jobs[0].completedAt;
assert.equal(reopenJobState.jobs[0].status,'Open','reopen must reset parent Job Card to Open');
assert.equal('completedAt' in reopenJobState.jobs[0],false,'reopen must clear parent completion date');


// V75.4 Ideal Time availability simulation
const availabilityMinutes=(assignments,emp,gapStart,gapEnd,previousJob)=>{
  const intervals=assignments.filter(a=>a.emp===emp&&a.job!=='ID001'&&a.job!==previousJob).map(a=>{
    const st=Math.max(gapStart,a.assignedAt||gapStart);
    const en=Math.min(gapEnd,a.completedAt||a.cancelledAt||gapEnd);
    return {start:st,end:en};
  }).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start);
  if(!intervals.length)return 0;
  let total=0,cs=intervals[0].start,ce=intervals[0].end;
  for(let i=1;i<intervals.length;i++){const x=intervals[i];if(x.start<=ce)ce=Math.max(ce,x.end);else{total+=(ce-cs)/60000;cs=x.start;ce=x.end}}
  return total+(ce-cs)/60000;
};
const g0=new Date(2026,8,21,10,0).getTime(),g1=new Date(2026,8,21,10,30).getTime();
assert.equal(availabilityMinutes([], 'E1', g0, g1, 'JC1'),0,'gap with no other assigned work must not be Ideal Time');
assert.equal(availabilityMinutes([{emp:'E1',job:'JC2',assignedAt:g0-60000}], 'E1', g0, g1, 'JC1'),30,'gap with another normal job already available must be Ideal Time');
assert.equal(availabilityMinutes([{emp:'E1',job:'JC1',assignedAt:g0-60000}], 'E1', g0, g1, 'JC1'),0,'paused prior job by itself must not create Ideal Time when no other work exists');

console.log('Functional smoke tests passed: Employee, ID001, holidays, Ideal Time availability, Supervisor, Manager, update/release contracts.');
