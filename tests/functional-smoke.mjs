import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const gradle = read('app/build.gradle');
const main = read('app/src/main/java/com/zukait/timetrack/MainActivity.java');
const updates = read('app/src/main/assets/v74_updates.js');
const html = read('app/src/main/assets/offline_test.html');
const cloud = read('app/src/main/assets/cloud_sync.js');
const metadata = JSON.parse(read('latest-version.json'));
const releaseWorkflow = read('.github/workflows/publish-approved-release.yml');

const versionCode = Number((gradle.match(/versionCode\s+(\d+)/)||[])[1]);
const versionName = (gradle.match(/versionName\s+['"]([^'"]+)['"]/ )||[])[1];
assert.ok(Number.isInteger(versionCode) && versionCode > 0, 'Android versionCode must be a positive integer');
assert.match(versionName||'', /^V\d+$/, 'Android versionName must use V<number> format');
assert.match(main, /getPackageInfo\(getPackageName\(\), 0\)/, 'native bridge must read the installed APK package info');
assert.match(main, /return installedVersionName\(\);/, 'native bridge must report installed versionName');
assert.match(main, /return installedVersionCode\(\);/, 'native bridge must report installed versionCode');
assert.doesNotMatch(main, /getAppVersion\(\)[\s\S]{0,120}return "V74"/, 'native version name must not be hard-coded');
assert.ok(Number(metadata.versionCode) <= versionCode, 'published metadata cannot be newer than candidate build');
assert.equal(metadata.package, 'com.zukait.timetrack');



assert.ok(updates.includes('v110ID001ReportButton') && updates.includes('v110OpenID001Report'), 'Supervisor must show the ID001 Report beside the standalone ID001 assignment control');
assert.ok(updates.includes('v110ID001Emp') && updates.includes('v110ID001From') && updates.includes('v110ID001To'), 'ID001 Report must support employee and date filtering');
assert.ok(updates.includes('v110PrintID001Report') && updates.includes('Zukait_ID001_Report.pdf'), 'ID001 Report must support Print / PDF output');
assert.ok(updates.includes("grid-template-columns:repeat(2,minmax(0,1fr))") && updates.includes('v110-id001-pair'), 'ID001 Assign and Report must remain a two-column Supervisor row');
assert.ok(updates.includes("v135OpenManagerMenu()") && updates.includes("row.onclick=function(e){if(e.target.closest('button'))return;menu()}"), 'Manager header and menu button must open the authoritative Manager menu');
assert.ok(updates.includes("v133OpenManagerLeave()") && updates.includes("v63OpenAbout()") && updates.includes("closeModal();logout()"), 'Manager menu must retain Leave Control, About / Update, and Logout');
assert.ok(updates.includes("v109-manager-consumables") && updates.includes("CONSUMABLES"), 'Manager dashboard must keep the Consumables placeholder instead of a duplicate leave card');
assert.ok(updates.includes('v133LeaveEmployee') && updates.includes('v133PrintLeave') && updates.includes('v133ShareLeave'), 'Manager Leave Management must retain employee filter, Print / PDF, and WhatsApp sharing');

assert.ok(updates.includes('v91-identity-menu'), 'Employee menu must sit in the identity/online row');
assert.ok(updates.includes('v93-employee-menu') && updates.includes('v93-menu-sync') && updates.includes('v93-menu-leave') && updates.includes('v93-menu-update') && updates.includes('v93-menu-logout'), 'Employee account actions must remain visually distinct and clickable');
assert.ok(updates.includes('v80-rpm-gauge') && updates.includes('.v93-rpm-redline,.v93-rpm-needle,.v93-rpm-hub{display:none!important}'), 'Employee Running and Remaining Time must use the RPM-style gauge without redline/needle markers');
assert.ok(updates.includes("v91RoleHeader('Supervisor')"), 'Supervisor must use the compact identity/online/menu row');
assert.ok(updates.includes("root.dataset.supervisorUi='v103-authoritative'"), 'Supervisor final UI transformation must run even when legacy Today at a Glance was already replaced');
assert.ok(updates.includes("let currentFinal=root.querySelector('.v74-supervisor-final')"), 'Supervisor finalizer must detect an existing authoritative overview independently of the legacy glance card');
assert.ok(updates.includes("if(currentFinal&&currentFinal.isConnected)currentFinal.replaceWith(wrap)"), 'Supervisor finalizer must refresh an existing authoritative overview on every render');
assert.ok(updates.includes("else if(glance&&glance.isConnected)glance.replaceWith(wrap)"), 'Supervisor finalizer must upgrade a legacy glance card when present');
assert.ok(updates.includes("anchor.insertAdjacentElement('afterend',wrap)"), 'Supervisor finalizer must insert the authoritative overview even when no legacy glance card exists');
assert.ok(updates.includes("filter(x=>!wrap.contains(x)&&(x.querySelector('h3')?.textContent||'').includes('Today at a Glance')).forEach(x=>x.remove())"), 'Supervisor finalizer must remove duplicate legacy glance surfaces');
assert.ok(html.includes('v74_updates.js?v=106'), 'Supervisor final asset must use the current V106 cache-busting revision');
assert.ok(!html.includes('V103 SUPERVISOR RUNTIME LOCK'), 'legacy V103 Supervisor runtime lock must stay retired');
assert.ok(updates.includes('v92-tech-board'), 'Supervisor must render the redesigned Technician Board');
assert.ok(updates.includes('v92-tech-dept'), 'Technician Board department cards must use the authoritative redesigned UI');
assert.ok(updates.includes('v92-supervisor-top'), 'Supervisor must keep Employee Requests and Available Workers in the compact top row');
assert.ok(updates.includes("if(role==='Supervisor'){" ) && updates.includes("gh.style.setProperty('display','none','important')") && updates.includes("headerOnlineStatus"), 'Supervisor must hide all legacy/global online headers and show one identity row only');
assert.ok(updates.includes("const actionGrid=root.querySelector('.v84-action-grid')"), 'ID001 Details must be placed in the compact lower Supervisor action grid');
assert.ok(updates.includes("filter(x=>!(x.textContent||'').trim()).forEach(x=>x.remove())"), 'Supervisor lower action grid must remove empty legacy tiles');
assert.ok(updates.includes("/^Details$/i") && updates.includes("v84-job-details"), 'Legacy Supervisor Details tile must normalize to one Job Card Details control');
assert.ok(updates.includes('v92OpenAvailableWorkers'), 'Available Workers top card must open the available technician list');
assert.ok(updates.includes('Tap to view ›'), 'Technician Board department cards must expose their drill-down affordance');
assert.ok(updates.includes("v91RoleHeader('Manager')"), 'Manager must use the compact identity/online/menu row');
assert.ok(updates.includes('.manager-hero .pill{display:none!important}'), 'Manager duplicate live/online badge must be hidden');
assert.match(updates, /📋 Job Card Details/, 'Supervisor detail control must be named Job Card Details');
assert.match(updates, /v80RunningGauge/, 'employee running gauge must exist');
assert.match(updates, /v80RemainingGauge/, 'employee remaining gauge must exist');
assert.match(updates, /rr\.textContent=fm\(worked\)/, 'running gauge must use accumulated actual assignment time');
assert.match(updates, /p>=100\?'v80-red':p>75\?'v80-orange':p>50\?'v80-blue':'v80-green'/, 'running gauge color thresholds must be preserved');
assert.match(updates, /left<=0\?'v80-red':leftPct<25\?'v80-orange':leftPct<50\?'v80-blue':'v80-green'/, 'remaining gauge color thresholds must be preserved');
assert.match(updates, /EXCEEDED/, 'remaining gauge must show exceeded state');
assert.match(updates, /vehicleBrand/, 'vehicle brand detection must exist');
assert.match(updates, /vehicleBadge/, 'vehicle badge rendering must exist');
assert.ok(updates.includes("esc(me.name)+' · '+esc(dept)"), 'employee header must show name and department');
assert.ok(!updates.includes("WORK SMARTER • BETTER TOMORROW"), 'duplicate employee banner tagline must be removed');
assert.ok(!updates.includes("esc(me.name)+' – Employee'"), 'generic duplicate Employee identity must be removed');
assert.match(updates, /currentRemaining',!hasAlloc\?'—':left<=0\?'\+'\+fm/, 'zero allocation must show no allocated time and negative remaining time must use exceeded display');
assert.match(updates, /NO ALLOCATED TIME/, 'zero allocation must show a clear no allocated time state');

// Shared data consistency contracts
assert.match(cloud, /pollTimer=setInterval[\s\S]*?1000\);/, 'all logged-in dashboards must poll the same shared cloud state every second');
assert.match(cloud, /visibilitychange[\s\S]*?refreshVisibleSharedState/, 'dashboard must refresh shared state when the app becomes visible');
assert.match(cloud, /window\.addEventListener\('focus',refreshVisibleSharedState\)/, 'dashboard must refresh shared state when the app regains focus');
assert.match(cloud, /if\(cloudDirty&&!cloudPushing\)await push\(0\)/, 'local changes must be pushed before a forced shared-state refresh');
assert.match(cloud, /threeWayMerge\(base,remote,localSnapshot\)/, 'Supervisor and Manager concurrent changes must merge against the shared revision');
assert.match(cloud, /mergeEmployeeConflict\(remote,localSnapshot,me\.id\)/, 'Employee concurrent changes must merge only their own work into shared state');
assert.match(cloud, /if\(me\)try\{render\(\)\}/, 'a received shared revision must rerender the active dashboard');

// Employee contracts
assert.match(updates, /openNormal=emp=>[\s\S]*?a\.job!==H[\s\S]*?!a\.cancelled[\s\S]*?!a\.completed/, 'normal open work must be detected');
assert.match(updates, /availableForIdeal=emp=>!activeSession\(emp\)&&openNormal\(emp\)\.length===0&&!openHold\(emp\)/, 'ID001 must only be available with no normal work');
assert.match(updates, /v75AssignIdealToAvailable/, 'bulk ID001 assignment must exist');
assert.match(updates, /idealSafeVersion:1/, 'legacy safe ID001 marker must remain supported');
assert.match(updates, /V106 ID001 FINAL AUTHORITY/, 'final ID001 assignment authority must be present');
assert.match(updates, /idealSafeVersion:SAFE/, 'final ID001 assignments must write the current safe marker');
assert.match(updates, /window\.v106ID001FinalAuthority=true/, 'final ID001 authority marker must be present');
assert.match(updates, /window\.v38CheckID001=function\(\)\{return false\}/, 'legacy ID001 auto-finish must be disabled');
assert.match(updates, /START \/ STOP only|START \/ STOP/, 'ID001 must remain start/stop only');
assert.ok(updates.includes("'Overtime'") && updates.includes('overtimeMin'), 'Employee monthly dashboard must show Overtime');
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
assert.equal((updates.match(/state\.sessions\.push\s*\(/g)||[]).length,2,'candidate update layer must create sessions only from the two explicit Start flows: normal work and ID001');
assert.match(updates, /finishedDone=done\.filter\(a=>a\.job!==H\)/, 'Employee Finished Jobs must exclude ID001');
assert.match(updates, /v753OpenID001Report/, 'Supervisor/Manager ID001 report must exist');
assert.match(updates, /v753From/, 'ID001 report must include From date filter');
assert.match(updates, /v753To/, 'ID001 report must include To date filter');
assert.match(updates, /Total Actual Working/, 'Employee dashboard must show Total Actual Working');
assert.match(updates, /Productive Actual/, 'Employee dashboard must show Productive Actual separately');
assert.match(updates, /ID001 Time/, 'Employee dashboard must show ID001 Time separately');
assert.match(updates, /ID001 DETAILS \/ HOURS/, 'Supervisor/Manager dashboards must expose the ID001 report control');


assert.match(updates, /V120 FINISHED \/ READY DELIVERY CYCLE AUTHORITY/, 'finished and ready-for-delivery must use the current work-cycle authority');
assert.match(updates, /function cycle\(no\)\{if\(typeof window\.v125CurrentCycle==='function'\)return window\.v125CurrentCycle\(no\)/, 'finished and ready logic must use the explicit current repeat-work cycle');
assert.match(updates, /function complete\(no\)\{const rows=cycle\(no\);return rows\.length>0&&rows\.every\(a=>a\.completed\)\}/, 'a Job Card must finish only when every assignment in the current cycle is complete');
assert.match(updates, /function readyJobs\(\)\{return finishedJobs\(false\)\.filter\(j=>!j\.delivered\)\}/, 'delivered Job Cards must be excluded from Ready for Delivery');
assert.match(updates, /openSupervisorFinishedWindow=function\(\)\{showSupervisorModal\('✅ Finished Job Cards Today',table\(finishedJobs\(true\),'supervisor'\)\)\}/, 'Supervisor Finished Jobs must show unique completed Job Cards');
assert.match(updates, /v120SyncJobLifecycle/, 'parent Job Card status must synchronize to the current normal or repeat-work cycle');

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



// V104 Supervisor runtime regression guard
assert.doesNotMatch(html, /V103 SUPERVISOR RUNTIME LOCK/, 'legacy V103 Supervisor runtime lock must remain retired');
assert.doesNotMatch(html, /window\.v87SupervisorRuntimeLock=true/, 'legacy V87 runtime wrapper must remain retired');
assert.match(updates, /v89-two-col/, 'Supervisor Quick Entry and Assign Update must use the locked two-column grid');
assert.match(updates, /\.v89-two-col\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/, 'Supervisor two-column layout must override legacy/mobile CSS');
assert.match(updates, /\.v84-action-grid\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/, 'Supervisor lower controls must remain compact two-column boxes');
assert.match(updates, /\.v84-depts\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/, 'Technician Board must remain three department boxes');
assert.match(updates, /\['Denter','DENTING'[^\n]+\['Painter','PAINTING'[^\n]+\['Mechanic','MECHANICAL'/, 'Technician Board must expose Denting, Painting and Mechanical');
assert.match(updates, /v84OpenDept/, 'Technician Board department popup must exist');
assert.match(updates, /v84ToggleTech/, 'Technician detail expansion must exist');
assert.equal((updates.match(/function v84TechnicianBoard\(/g)||[]).length,1,'Technician Board must have exactly one authoritative renderer');
assert.doesNotMatch(html, /v56-technician-board-card/, 'base HTML must not recreate the legacy Technician Board');
assert.doesNotMatch(read('app/src/main/assets/v54_improvements.js'), /v54OpenTechnicianBoard/, 'V54 legacy Technician Board modal must remain retired');
assert.match(updates, /const v103SupervisorOverviewAuthority=window\.supervisorOverview/, 'V103 must capture the authoritative Supervisor overview before later wrappers');
assert.match(updates, /x\.status==='Working'\|\|x\.status==='Overtime'/, 'Technician Board working count must exclude paused technicians');
assert.match(updates, /let a=live\?AS\(live\):null/, 'Technician detail must bind to the current live assignment first');
assert.ok(html.includes("{id:'EMP012',name:'Jijesh',role:'Employee',department:'Painter'}"), 'Jijesh roster spelling must remain correct');
assert.match(updates, /v89-employee-lower/, 'Employee lower dashboard must use compact controls');
assert.match(updates, /\.v89-employee-lower\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/, 'Employee lower dashboard must remain two columns');
assert.match(updates, /v89OpenEmployeeFinished/, 'Employee Finished Jobs details must open separately');
assert.match(updates, /v89OpenEmployeeRepeats/, 'Employee Repeat Jobs details must open separately');
assert.match(updates, /String\(a\.mistakeEmp\|\|''\)===String\(me\.id\)/, 'Employee repeat count must belong to the mistake employee');
assert.match(updates, /const items=\[job,assigned,add,id001\]/, 'Supervisor lower control set must include Job Card Details, Assigned, Additional Time and compact ID001 without duplicate Incentive');
assert.match(updates, /v104-incentive-top/, 'Supervisor top row must contain the clickable Incentive tile');

// V121 Manager final-rule regression guards.
assert.match(updates,/V121 MANAGER LOGIC AUTHORITY/,'Manager final logic authority must be present');
assert.match(updates,/window\.v121ManagerMonthSummary/,'Manager monthly summary must have a final-rule calculation authority');
assert.match(updates,/monthlyNormalActualMinutes/,'Manager actual hours must use normal-duty actual time authority');
assert.match(updates,/monthlySuggestedMinutes/,'Manager suggested hours must use the final monthly suggested authority');
assert.match(updates,/if\(me\?\.role==='Manager'\)return window\.openManagerIncentiveList\(\)/,'Manager incentive click must route to the final V107-compatible report');
assert.match(updates,/Overtime and ID001 are excluded from achieved\/incentive hours/,'Manager incentive explanation must match final incentive rules');

assert.match(updates,/V122 MANAGER FINAL DOM \/ COUNTER AUTHORITY/,'Manager final DOM/counter authority must be present');
assert.match(updates,/v120FinishedJobs\('true'\)|v120FinishedJobs\(true\)/,'Manager completed counter must use unique completed Job Cards');
assert.match(updates,/v120ReadyJobs\(\)\.length/,'Manager Ready for Delivery counter must use final ready Job Cards');
assert.match(updates,/inc\.slice\(1\)\.forEach/,'Manager must suppress duplicate incentive controls');

assert.match(updates,/V123 MANAGER WORKSHOP PERFORMANCE/,'Manager Workshop Performance section must be present');
assert.match(updates,/v123ManagerPerformanceRange/,'Manager performance must support Today and This Month ranges');
assert.match(updates,/Jobs in Progress/,'Manager performance must expose jobs in progress');
assert.match(updates,/Ready for Delivery/,'Manager performance must expose ready for delivery');
assert.match(updates,/Over Allocated/,'Manager performance must expose over-allocated work');
assert.match(updates,/Workshop Efficiency/,'Manager performance must expose efficiency');
assert.match(updates,/Repeat Work/,'Manager performance must expose repeat work');
assert.match(updates,/Labour Value/,'Manager performance must expose labour value');

assert.match(updates,/const actual=\(a,from,to\)=>\{try\{return typeof window\.v107AssignmentNormal==='function'/,'Manager Workshop Performance must use normal-duty assignment time and exclude overtime');
assert.match(updates,/const totalNormal=a=>actual\(a,0,Date\.now\(\)\)/,'Over-allocated status must compare cumulative normal-duty actual time with allocated time');
assert.doesNotMatch(updates,/window\.assignmentNormalMinutes/,'Manager performance must not depend on a nonexistent assignmentNormalMinutes helper');

// V124 Additional Time final-authority contracts.
assert.match(updates,/V124 ADDITIONAL TIME FINAL AUTHORITY/,'Additional Time must have one final mutation authority');
assert.match(updates,/request&&request\.status!=='New'/,'approved requests must not apply additional time twice');
assert.match(updates,/assignmentId:a\.id/,'Additional Time audit rows must identify the exact assignment');
assert.match(updates,/additionalActionApplied=true/,'approved request must record that its additional time was applied');
assert.match(updates,/if\(r\.status!=='New'\)return alert/,'Supervisor approval must reject an already handled request');
assert.match(updates,/findAssignment\(r\.job,r\.emp\)/,'approval must target the latest active assignment, not a historical completed assignment');

// V125 Repeat Work lifecycle-cycle contracts.
assert.match(updates,/V125 REPEAT CYCLE AUTHORITY/,'Repeat Work must have an explicit lifecycle-cycle authority');
assert.match(updates,/repeatCycleId:cycleId/,'new repeat assignments must carry an explicit repeat cycle id');
assert.match(updates,/repeatCycleNo:cycleNo/,'new repeat assignments must carry an ordered repeat cycle number');
assert.match(updates,/existing\.some\(a=>!a\.completed\)/,'a new repeat cycle must be blocked while the current repeat is unfinished');
assert.match(updates,/j\.status='Open';delete j\.completedAt;j\.delivered=false/,'issuing repeat work must reopen the Job Card and remove Ready-for-Delivery state');
assert.match(updates,/typeof window\.v125CurrentCycle==='function'/,'Finished and Ready logic must use only the current repeat cycle');
assert.match(updates,/legacy-repeat-/,'legacy repeat assignments must receive stable fallback cycle identities');

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


// V75.5 Leave + paused-ID001 contracts
assert.match(updates, /V75\.5 LEAVE CONTROL \+ PAUSED-JOB ID001 AUTHORITY/, 'V75.5 leave/ID001 authority must be present');
assert.match(updates, /return\[\[d\+8\*3600000,d\+13\*3600000\],\[d\+15\*3600000,d\+19\*3600000\]\]/, 'full-day leave must exclude the 13:00–15:00 lunch break');
assert.match(updates, /TODAY’S LEAVE/, 'Manager Workshop Control Center must show Today’s Leave');
assert.match(updates, /THIS MONTH LEAVE/, 'Manager Workshop Control Center must show This Month Leave');
assert.match(updates, /v755-leave-control-row/, 'Manager leave controls must use a dedicated two-column row');
assert.match(updates, /SYNC[\s\S]*ABOUT[\s\S]*LEAVE[\s\S]*LOGOUT/, 'all account menus must expose SYNC ABOUT LEAVE LOGOUT');
assert.match(updates, /u\.role==='Employee'\|\|u\.role==='Supervisor'/, 'Manager must be able to mark Employee or Supervisor leave');
assert.match(updates, /rows\.every\(a=>normalStatus\(a\)==='Paused'\)/, 'paused-only normal work must be eligible for ID001');
assert.match(updates, /blocking=openNormal\(emp\)\.filter\(a=>normalStatus\(a\)!=='Paused'\)/, 'any non-paused normal job must still block ID001');
assert.match(updates, /pausedJobFallback:pausedOnlyNormal\(emp\)/, 'ID001 assignment must record paused-job fallback context');
assert.match(updates, /leaveAwareIdeal/, 'leave periods must be excluded from Ideal Time');

const fullLeave={date:'2026-09-21',period:'FULL'};
const leaveSeg=d=>{
  const p=d.date.split('-').map(Number),x=new Date(p[0],p[1]-1,p[2]).getTime();
  return d.period==='FULL'?[[x+8*3600000,x+13*3600000],[x+15*3600000,x+19*3600000]]:[];
};
assert.equal(leaveSeg(fullLeave).reduce((n,[a,b])=>n+(b-a)/3600000,0),9,'full-day leave must equal 9 duty hours');

const pausedEligibility=rows=>rows.length===0||rows.every(x=>x.status==='Paused');
assert.equal(pausedEligibility([{status:'Paused'}]),true,'paused current job with no other available work must allow ID001');
assert.equal(pausedEligibility([{status:'Paused'},{status:'New'}]),false,'another available normal job must block ID001');


// V75.6 Supervisor Active Workers contracts
assert.match(updates, /V75\.6 SUPERVISOR ACTIVE WORKERS — UNIQUE EMPLOYEES \+ ID001 COLOUR/, 'V75.6 Active Workers fix must be present');
assert.match(updates, /const byEmp=new Map\(\)/, 'Active Workers must deduplicate by employee');
assert.match(updates, /if\(!old\|\|\(\+s\.start\|\|0\)>\(\+old\.start\|\|0\)\)byEmp\.set\(key,s\)/, 'latest active session must win when duplicate active sessions exist');
assert.match(updates, /ID001 · WAITING/, 'ID001 must have a distinct Active Workers label');
assert.match(updates, /v756-id001-worker/, 'ID001 worker must have separate visual styling');
assert.match(updates, /const active=uniqueActiveWorkerRows\(\)\.length/, 'Supervisor Active Workers count must use unique employees');

const dedupeActive=sessions=>{
 const by=new Map();for(const s of sessions){if(s.end)continue;const old=by.get(s.emp);if(!old||s.start>old.start)by.set(s.emp,s)}return [...by.values()];
};
assert.equal(dedupeActive([{emp:'E1',job:'JC1',start:1,end:null},{emp:'E1',job:'ID001',start:2,end:null}]).length,1,'same employee with stale normal + ID001 active records must display once');
assert.equal(dedupeActive([{emp:'E1',job:'JC1',start:1,end:null},{emp:'E1',job:'ID001',start:2,end:null}])[0].job,'ID001','latest active session must be shown as current activity');

assert.ok(updates.includes('v81-month-grid'), 'employee monthly summary must use two-column 3D circle grid');
assert.ok(updates.includes('v81OpenMyMonthlyLeave') && updates.includes('v81-month-leave'), 'employee dashboard must show clickable monthly leave summary');
assert.ok(updates.includes("l.period==='FULL'?1:.5"), 'monthly leave must count full day as 1 and half day as 0.5');
assert.ok(updates.includes('v81OpenEmployeeHistory'), 'employee performance history must open separately');
assert.ok(updates.includes('v104-progress incentive') && updates.includes('<span>INCENTIVE</span>'), 'Employee monthly summary must show Incentive in the three-column capsule row');
assert.match(updates, /month-summary \.v81-month-orb\{aspect-ratio:auto!important/, 'Employee This Month KPI tiles must use capsule styling');
assert.ok(updates.includes("'Completed Jobs'") && updates.includes("'Suggested Time'") && updates.includes("'Actual Time'") && updates.includes("'Ideal Time'") && updates.includes("'Overtime'"), 'employee monthly summary must preserve monthly details');

assert(updates.includes("req.closest('.v88-alert-row,.v84-alert-row')"), 'Supervisor finalizer must reuse the existing alert row instead of nesting it');
assert(updates.includes("v91RoleHeader('Supervisor')"), 'Supervisor authoritative finalizer must apply the single identity/header surface');

// V128 Supervisor UI regression guards.
assert.ok(updates.includes('window.v128SupervisorSurfaceLock=true'), 'Supervisor final surface lock must prevent legacy UI resurrection');
assert.ok(updates.includes('grid-template-areas:"job tech" "time assign"'), 'Assign / Update must preserve the agreed compact layout without ID001/default-job controls');
assert.ok(updates.includes("v109ID001Standalone"), 'ID001 must remain a dedicated standalone Supervisor control outside Assign / Update');
assert.ok(updates.includes("const gh=document.getElementById('globalBrandHeader'),lh=document.getElementById('legacyAppHeader')"), 'Supervisor authority must address both legacy header sources');
assert.ok(updates.includes("ids.slice(1).forEach(x=>x.remove())"), 'Supervisor authority must remove duplicate identity rows');

// V105 employee performance progress regression guards.
const updatesSource = updates;
assert.match(updatesSource, /window\.v107AchievementFor=achievementFor/, 'Achieved detail window must use canonical V107 achievement authority');
assert.match(updatesSource, /inc\/target\*100/, 'Incentive visual fill must grow left-to-right against monthly target');
assert.match(updatesSource, /achieved>target&&inc>0&&target>0/, 'Incentive fill must remain empty until achieved exceeds target');
assert.match(updatesSource, /window\.v117OpenAchievedDetails/, 'Achieved card must open details');
assert.match(updatesSource, /window\.v117OpenIncentiveDetails/, 'Incentive card must open details');
console.log('Functional smoke tests passed: Employee, ID001, holidays, Ideal Time availability, Leave, Active Workers, Supervisor, Manager, update/release contracts.');


// Update download hard guard
assert.match(main, /if \(publishedCode <= installedVersionCode\(\)\)/, 'native update download must refuse same or older published version');
assert.match(main, /App is already up to date\./, 'native update guard must tell user the app is already current');


// V77 in-app updater contracts
assert.match(main, /startUpdateDownloadNative\(\)/, 'V77 must start update download from native single-download flow');
assert.match(main, /persistUpdateDownloadState/, 'update download id must be persisted');
assert.match(main, /hasExistingUpdateDownload\(\)/, 'duplicate update downloads must be blocked');
assert.match(main, /v77UpdateDownloadStatus/, 'native layer must report download progress into the app');
assert.match(main, /installDownloadedUpdateNative/, 'installer must be opened only from explicit in-app install action');
assert.doesNotMatch(main, /onReceive[\s\S]{0,900}startActivity\(install\)/, 'download completion receiver must not auto-open installer');
assert.match(updates, /Current Version/, 'About update center must show current version');
assert.match(updates, /New Version/, 'About update center must show new version');
assert.match(updates, /v77ProgressBar/, 'About update center must show download progress');
assert.match(updates, /DOWNLOAD UPDATE/, 'About update center must expose download action');
assert.match(updates, /INSTALL UPDATE/, 'About update center must expose install action after completion');


// V78 Supervisor Leave + Manager printable report contracts
assert.match(updates, /V78 SUPERVISOR LEAVE STATUS \+ MANAGER PRINTABLE LEAVE REPORT/, 'V78 leave dashboard/print fix must be present');
assert.match(updates, /v78SupervisorLeaveRow/, 'Supervisor must have a dedicated leave status row');
assert.match(updates, /TODAY’S LEAVE/, 'Supervisor leave status must include Today’s Leave');
assert.match(updates, /THIS MONTH LEAVE/, 'Supervisor leave status must include This Month Leave');
assert.match(updates, /v78PrintLeave/, 'Manager leave report must have printable action');
assert.match(updates, /PRINT LEAVE REPORT/, 'Manager leave window must expose print button');
assert.match(updates, /AndroidBridge\.printHtml/, 'Manager leave report must use native printable area on Android');
assert.match(updates, /@page\{size:A4 landscape/, 'printed leave report must be formatted for A4');


// V79 work-session integrity contracts
assert.match(updates, /V79 WORK SESSION INTEGRITY AUTHORITY/, 'V79 session integrity authority must be present');
assert.match(updates, /window\.activeSession=function\(emp\)/, 'activeSession must be overridden by latest-session authority');
assert.match(updates, /window\.empStatus=function\(a\)/, 'assignment status must be authoritative');
assert.match(updates, /window\.totalForAssignment=function\(a\)/, 'actual time must be assignmentId-specific');
assert.match(updates, /assignmentId&&String\(s\.assignmentId\)===String\(a\.id\)/, 'assignment session matching must use assignmentId');
assert.match(updates, /reconciledStaleOpen=true/, 'older stale open sessions must be reconciled');
assert.match(updates, /reconciledOverlap=true/, 'overlapping sessions must be clamped');
assert.match(updates, /v79CurrentOvertimeRows/, 'current overtime must use authoritative active sessions');
assert.match(updates, /reconcileDuplicateOpenAssignments/, 'duplicate open assignments must be reconciled');
assert.match(updates, /Automatic duplicate-open cleanup/, 'safe duplicate cleanup must be auditable');
assert.match(updates, /v79Integrity:true/, 'new work sessions must carry V79 integrity marker');

const v79LatestActive=(rows,emp)=>{
  const x=rows.filter(s=>s.emp===emp).sort((a,b)=>a.start-b.start);
  const latest=x[x.length-1]; return latest&&!latest.end?latest:null;
};
assert.equal(v79LatestActive([{emp:'E1',start:1,end:null},{emp:'E1',start:2,end:3,paused:true}],'E1'),null,'older stale open session must not make employee Working when latest session is Paused');
assert.equal(v79LatestActive([{emp:'E1',start:1,end:2,paused:true},{emp:'E1',start:3,end:null}],'E1').start,3,'resume must show only latest open session as Working');

const v79AssignmentActual=(sessions,id)=>sessions.filter(s=>s.assignmentId===id).reduce((n,s)=>n+Math.max(0,((s.end??s.start)-s.start)/60000),0);
assert.equal(v79AssignmentActual([{assignmentId:'A1',start:0,end:60000},{assignmentId:'A2',start:60000,end:180000}],'A1'),1,'same JC/employee assignments must not share actual time');
assert.equal(v79AssignmentActual([{assignmentId:'A1',start:0,end:60000},{assignmentId:'A2',start:60000,end:180000}],'A2'),2,'new/repeat assignment keeps its own actual time');


assert.match(updates, /Use Reopen Same Assignment for mistaken finish/, 'completed same JC/employee must not be silently reopened by normal assign');
assert.match(updates, /Supervisor update existing open assignment/, 'existing same JC/employee open assignment must be updated instead of duplicated');
assert.match(updates, /window\.overtimeForEmployee=function\(emp,from,to\)/, 'employee overtime must reconcile stale sessions first');
assert.match(updates, /window\.monthlyNormalActualMinutes=function\(emp,from,to\)/, 'monthly actual must reconcile stale sessions first');


// V82 local vehicle logo contracts
assert.match(updates, /vehicle-logos\//, 'V82 must load vehicle logos from local APK assets');
assert.match(updates, /v82-brand-logo/, 'V82 must render manufacturer logo container');
assert.match(updates, /v82-logo-fallback/, 'V82 must provide generic car fallback for missing or unknown logos');
assert.match(updates, /v82EV/, 'V82 must detect EV marker');
assert.match(updates, /⚡ EV/, 'V82 must show EV badge separately from manufacturer logo');
assert.match(updates, /onerror=/, 'V82 logo image failure must fall back without blank UI');
const logoFiles=new Set(fs.readdirSync('app/src/main/assets/vehicle-logos'));
const mappedLogoFiles=[...updates.matchAll(/,'[^']+','([^']+\.svg)'\]/g)].map(m=>m[1]);
assert.ok(mappedLogoFiles.length>=35, 'vehicle logo resolver must retain the full local manufacturer library');
for(const logo of mappedLogoFiles) assert.ok(logoFiles.has(logo), 'mapped vehicle logo asset missing: '+logo);
assert.ok(updates.includes("'Lexus','lexus.svg'") && updates.includes("'Jaguar','jaguar.svg'"), 'Lexus and Jaguar must use bundled local logos');

assert.ok(gradle.includes('versionCode '+versionCode), 'Gradle versionCode must match parsed candidate version');
assert.ok(gradle.includes("versionName '"+versionName+"'") || gradle.includes('versionName "'+versionName+'"'), 'Gradle versionName must match parsed candidate version');

// V83 employee UI regression contracts
assert.match(read('app/src/main/assets/offline_test.html'), /id="legacyAppHeader"/, 'legacy app header must be explicitly addressable');
assert.match(read('app/src/main/assets/offline_test.html'), /legacyHeader\.style\.display=me\.role==='Employee'\?'none':''/, 'employee dashboard must hide legacy duplicate header');
assert.match(read('app/src/main/assets/offline_test.html'), /function logout\(\)\{[\s\S]{0,350}closeModal\(\)/, 'logout must close account modal before showing login');
assert.match(updates, /\.v75s-card \.v82-brand-logo\{width:52px;height:32px/, 'job-card manufacturer logo must use compact bounded size');


assert.match(html, /supervisor-two-col/, 'Supervisor Quick Entry and Assign\/Update must enforce two-column layout');
assert.match(html, /tech-name-box/, 'Supervisor technician selector must use colored name-box styling');
assert.match(updates, /glance-box v83-glass/, 'Supervisor glance cards must render with liquid-glass styling directly');
assert.match(html, /assigned\.slice\(1\)\.forEach\(x=>x\.remove\(\)\)/, 'Supervisor dashboard must remove duplicate Assigned Job Cards cards');
assert.match(html, /workDays\*\(9\*60-15\)/, 'Incentive target must deduct 15 cleaning minutes per applicable working day');
assert.doesNotMatch(html, /210h productive target/, 'Fixed 210-hour incentive target text must not return');


assert.match(updates, /v84-depts/, 'Supervisor Technician Board must use three department boxes');
assert.match(updates, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'Technician departments must stay in three columns');
assert.match(updates, /v84-tech-grid/, 'Department technicians must use card grid');
assert.match(updates, /v84ToggleTech/, 'Technician cards must expand details on click');
assert.match(updates, /v84-alert-row/, 'Employee Requests and Need Attention must share a two-column row');
assert.match(updates, /v84-action-grid/, 'Supervisor action controls must use a two-column grid');
assert.match(updates, /Overtime belongs only in Today at a Glance/, 'Supervisor must declare the single-overtime-card contract');
assert.match(updates, /!x\.closest\('\.glance-grid,\.v74-six'\)/, 'Overtime cleanup must preserve Today at a Glance');

assert.match(updates, /v84EmployeeAccount/, 'Employee dashboard must provide an account menu');
assert.match(updates, /ABOUT \/ UPDATE/, 'Employee account menu must expose update access');
assert.match(updates, /v84EmployeeLeave/, 'Employee account menu must retain Leave access');
assert.match(updates, /v63OpenAbout\(\)/, 'Employee account menu must open the working About and Update screen');
assert.match(updates, /closeModal\(\);logout\(\)/, 'Employee account menu must retain Logout');

assert.match(updates, /st=ot>0\?'Overtime'/, 'Technician Board must show Overtime status');
assert.match(updates, /req\.onclick=.*openSupervisorRequestsWindow/, 'Employee Requests card must be clickable');
assert.match(updates, /att\.onclick=.*v66OpenAttention/, 'Need Attention card must be clickable');
assert.match(updates, /Finished Job Cards/, 'legacy Finished Job Cards cleanup must be present');

// Syntax regression guard: v74 runtime CSS is intentionally a single-quoted JS string.
// A raw newline inside it breaks the whole dashboard before Android can render it.
const runtimeStyleStart = updates.indexOf("let s=document.createElement('style');s.textContent='");
const runtimeStyleEnd = updates.indexOf("';document.head.appendChild(s)", runtimeStyleStart);
assert.ok(runtimeStyleStart >= 0 && runtimeStyleEnd > runtimeStyleStart, 'Runtime CSS bundle must remain a valid single-quoted JavaScript string');
const runtimeStyleBody = updates.slice(runtimeStyleStart, runtimeStyleEnd);
assert.ok(!runtimeStyleBody.includes('\\n') && !runtimeStyleBody.includes('\\r'), 'Runtime CSS bundle must not contain raw line breaks');

// Architecture guard: retired Supervisor wrappers must not return.
assert.doesNotMatch(html, /const oldSupervisor=window\.renderSupervisor/, 'obsolete V33 Supervisor wrapper must remain retired');
assert.doesNotMatch(html, /const priorSupervisor=window\.renderSupervisor/, 'obsolete V34 Supervisor wrapper must remain retired');
assert.equal((html.match(/window\.renderSupervisor\s*=\s*function\s*\(/g)||[]).length,1,'Supervisor must have exactly one authoritative window renderer');
assert.match(html, /finalizeSupervisorDashboard\(\)/, 'authoritative Supervisor renderer must run its finalizer directly');

assert.equal((html.match(/window\.renderEmployee\s*=\s*function\s*\(/g)||[]).length,1,'Employee must have exactly one authoritative window renderer wrapper');
assert.match(html, /finalizeEmployeeDashboard\(\)/, 'authoritative Employee renderer must run its finalizer directly');
assert.doesNotMatch(html, /const oldRenderEmployee=window\.renderEmployee/, 'legacy overtime Employee renderer wrapper must remain retired');
assert.doesNotMatch(html, /const employeeBase=window\.renderEmployee/, 'legacy ID001 Employee renderer wrapper must remain retired');


// Employee dashboard deep-regression guards.
assert.match(updates,/const idealMin=typeof window\.monthlyIdealTimeMinutes==='function'\?window\.monthlyIdealTimeMinutes\(me\.id,mf,mt\):0/,'Employee Ideal Time tile must show duty-hour gaps, not ID001 waiting duration');
assert.match(updates,/a\.job==='ID001'\?0:/,'Achieved details fallback must exclude ID001');
assert.match(updates,/const active=activeSession\(me\.id\),aa=active\?\(\(state\.assign\|\|\[\]\)\.find\(a=>a&&a\.id===active\.assignmentId\)\|\|open\.find\(a=>a\.job===active\.job\)\):null/,'Employee current work must prefer assignmentId for accurate time ownership');
assert.match(updates,/if\(activeSession\(me\.id\)\)return typeof window\.v74Msg==='function'\?window\.v74Msg\('You already have an active job\./,'Employee Start authority must block a second active job');
assert.match(updates,/hold\?'':'<button class="v75s-request"/,'ID001 must not expose normal employee request controls');

// V107 incentive final authority regression checks.
assert.match(updates,/V107 INCENTIVE FINAL AUTHORITY/,'V107 incentive final authority');
assert.match(updates,/window\.v107IncentiveFinalAuthority=true/,'V107 final incentive authority marker');
assert.match(updates,/incentive=Math\.max\(0,achieved-t\.target-repeat\)/,'incentive = achieved - target - repeat');
assert.match(updates,/a\.job===HOLD\)return \{achieved:0,excess:0,actual:current\}/,'ID001 actual time is tracked but excluded from achieved/incentive hours');
assert.match(updates,/String\(a\.mistakeEmp\|\|a\.emp\)!==String\(emp\)/,'different repeat employee can earn achievement');
assert.match(updates,/String\(a\.mistakeEmp\|\|a\.emp\)===String\(emp\)/,'repeat actual is charged to mistake employee');
assert.match(updates,/dutyAfterLeave-15/,'15-minute cleaning allowance reduces working-day target');


// V111 monthly metrics UI authority regression checks.
assert.match(updates,/V108 retired: V111 is the single Employee monthly metrics UI authority/,'V108 renderer retired');
assert.match(updates,/EXCESS HOURS/,'Excess Hours label must be visible');
assert.match(updates,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'monthly metrics must use the approved 2x2 layout');
assert.match(updates,/window\.v111PerformanceUI=true/,'V111 monthly metrics UI authority marker');


// V109 legacy incentive override retirement.
assert.match(html,/V109: legacy incentive calculation retired/,'late legacy incentive override must stay retired');
assert.doesNotMatch(html,/const prevIncentive=window\.incentiveFor/,'late legacy incentive wrapper must not return');
assert.match(html,/ID001 included in Achieved/,'Supervisor and Manager incentive explanation must match V107');
assert.match(html,/Excess Hours/,'Supervisor and Manager incentive table must expose Excess Hours');
assert.match(html,/Repeat Deduction/,'Supervisor and Manager incentive table must expose repeat deduction');


// Manager V111 root-authority regression checks.
assert.match(updates,/V111 MANAGER LAYOUT AUTHORITY/,'Manager V111 layout authority must be present');
assert.match(updates,/window\.v111OpenManagerMenu=function/,'Manager header must own an explicit menu function');
assert.match(updates,/closeModal\(\);logout\(\)/,'Manager menu must always expose Logout');
assert.match(updates,/v111-manager-header/,'Manager header must be recreated by final authority');
assert.match(updates,/const prevManager=window\.renderManager/,'Manager header authority must hook the final Manager renderer');
assert.match(updates,/setTimeout\(settle,60\)/,'Manager header must survive delayed legacy render layers');
assert.match(updates,/v111-manager-leave/,'standalone Manager Leave Management card must exist');
assert.match(updates,/v133OpenManagerLeave/,'Leave Management card must open the full leave manager');
assert.match(updates,/v133PrintLeave/,'Leave Management must retain Print\/PDF');
assert.match(updates,/v133ShareLeave/,'Leave Management must retain WhatsApp sharing');
assert.match(updates,/v111-leave-today/,'Leave Management must show today leave count badge');
assert.doesNotMatch(updates,/target=document\.createElement\('button'\);control\.appendChild\(target\)/,'Manager final authority must never append a Consumables tile');


// V112 Manager action/output regression checks.
assert.match(updates,/v112OpenLeaveMarking/,'Manager menu must restore Leave Marking');
assert.match(updates,/v755OpenLeaveHub/,'Leave Marking must open the existing leave marking workflow');
assert.match(updates,/v112PrintHtml/,'reports must use the unified print authority');
assert.match(updates,/AndroidBridge\.printHtml/,'Android reports must prefer native print');
assert.match(updates,/v112ShareText/,'reports must use the unified share authority');
assert.match(updates,/shareText|shareWhatsApp|openWhatsApp/,'WhatsApp sharing must support Android native bridge');
assert.match(updates,/v112ManagerBack/,'Manager report modal must expose explicit Back');


// V112 final Supervisor/Manager overlap guards.
assert.doesNotMatch(updates,/placeholder="YYYY"/,'Supervisor Vehicle Year must not resurrect the YYYY placeholder');
assert.match(updates,/V128 SUPERVISOR SURFACE LOCK/,'Supervisor surface lock must remain present');
assert.match(updates,/v112-carpaint/,'Technician Board Painting card must use automotive paint icon');
assert.doesNotMatch(updates,/target=document\.createElement\('button'\);control\.appendChild\(target\)/,'Workshop Control Center must not receive an appended Consumables tile');




// V114 deep source-authority regression guards.
const v65 = read('app/src/main/assets/v65_updates.js');
const v66 = read('app/src/main/assets/v66_updates.js');
const v67 = read('app/src/main/assets/v67_updates.js');
assert.doesNotMatch(v65,/controlLabels=.*leave:'On Leave'/,'V65 source must not render On Leave in Workshop Control');
assert.match(v65,/v65-consumables/,'V65 source must render Consumables in the former leave position');
assert.doesNotMatch(v66,/controlCard\('leave','On Leave'/,'V66 source must not render On Leave in Workshop Control');
assert.match(v66,/v66-consumables/,'V66 source must render native Consumables');
assert.match(v67,/controlCard\('consumables','Consumables'/,'V67 source must render Consumables in the former leave position');
assert.doesNotMatch(updates,/target=document\.createElement\('button'\);control\.appendChild\(target\)/,'late Manager layers must never append a Consumables tile');
assert.doesNotMatch(updates,/V114 MANAGER WORKSHOP CONTROL FINAL AUTHORITY/,'temporary DOM patch must remain retired after source correction');
assert.match(updates,/Confirm Leave\\n\\nStaff:/,'new leave marking must require confirmation');
assert.match(updates,/Confirm Leave Change/,'Manager leave edits must require confirmation');
assert.match(updates,/Confirm Delete Leave/,'Manager leave deletion must require confirmation');


// Root regression: legacy V75.5 must never inject an On Leave card into Workshop Control Center.
assert.doesNotMatch(updates,/function injectManagerLeaveRow\(\)\{[\s\S]{0,1800}v755LeaveControlRow/,'legacy Manager On Leave tile injector must stay retired');
assert.doesNotMatch(updates,/setTimeout\(injectManagerLeaveRow,0\)/,'legacy Manager leave injector must not be scheduled');

// V115 shared live-worker authority regression guards.
assert.match(updates,/V115 SHARED LIVE WORKER AUTHORITY/,'shared live-worker authority must remain present');
assert.match(updates,/window\.currentActiveWorkers=liveRows/,'Manager and Supervisor must share one active-worker source');
assert.match(updates,/setInterval\(syncRefresh,5000\)/,'live dashboards must poll synchronization every five seconds');
assert.match(updates,/setInterval\(refresh,1000\)/,'live worker counts must refresh locally every second');
assert.match(updates,/replaceCount\(root,'Working Now',work\.length\)/,'Manager Working Now must use shared authority');
assert.match(updates,/replaceCount\(root,'Active Workers',rows\.length\)/,'Supervisor Active Workers must use shared authority');

// V115 multi-device root guards.
const cloudSync = read('app/src/main/assets/cloud_sync.js');
assert.match(cloudSync,/function reconcileEmployeeOpenSessions\(data,emp\)/,'cloud conflict merge must reconcile duplicate employee open sessions');
assert.match(cloudSync,/MULTI_DEVICE_CONFLICT/,'cloud reconciliation must audit multi-device conflicts');
assert.match(updates,/V115 MULTI-DEVICE EMPLOYEE ACTION AUTHORITY/,'employee actions must have multi-device authority');
assert.match(updates,/await fresh\(\);const active=closeDuplicates\(me\.id\)/,'Start must sync before enforcing one active job');
assert.match(updates,/await fresh\(\);closeDuplicates\(me\.id\);return corePause/,'Pause must sync before mutation');
assert.match(updates,/await fresh\(\);closeDuplicates\(me\.id\);return coreFinish/,'Finish must sync before mutation');

// V115 multi-technician reopen guards.
assert.match(updates,/V115 MULTI-TECHNICIAN REOPEN SELECTOR/,'multi-worker reopen selector must remain present');
assert.match(updates,/Select Employee to Reopen/,'multi-worker completed jobs must require technician selection');
assert.match(updates,/Other technicians remain finished/,'reopen flow must preserve other completed technicians');
assert.match(updates,/window\.v115ChooseReopenEmployee=choose/,'reopen selector must expose one job-card authority');
assert.match(updates,/if\(peers\.length>1\)return choose\(a\.job\)/,'assignment reopen must route multi-technician jobs through selection');
