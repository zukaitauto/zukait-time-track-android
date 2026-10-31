// V377 Workshop Performance static wiring regression checks.
// Run: node tests/v377-workshop-performance-ui.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../app/src/main/assets/offline_test.html',import.meta.url),'utf8');
const start=html.indexOf("const cards=[['Work in Progress'");
assert.ok(start>=0,'Workshop Performance theme script exists');
const section=html.slice(start,html.indexOf('})();',start)+5);
assert.match(section,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'two-column desktop grid');
for(const [key,order] of [['progress',2],['repeat',3],['efficiency',4],['overallocated',1],['parts',5],['consumables',6],['cash',7],['insurance',8]]){
 const marker='data-perf-key=\\\"'+key+'\\\"]{';
 const pos=section.indexOf(marker);
 assert.ok(pos>=0,key+' card style exists');
 const rule=section.slice(pos,section.indexOf('}',pos));
 assert.ok(rule.includes('order:'+order+';'),key+' card order');
}
assert.match(section,/window\.v377OpenOverAllocated\(\)/,'over-allocated tile opens overdue list');
assert.match(section,/window\.openEmployeeEfficiency\(\)/,'efficiency tile opens employee ranking');
assert.match(section,/event\.stopImmediatePropagation\(\)/,'legacy handler blocked');
assert.match(html,/Completed normal assignments only/,'employee ranking excludes repeat assignments');
const legacy=readFileSync(new URL('../app/src/main/assets/v74_updates.js',import.meta.url),'utf8');
assert.match(legacy,/if\(typeof window\.v377OpenOverAllocated==='function'\)return window\.v377OpenOverAllocated\(\)/,
 'legacy Manager tile must delegate to detailed V377 popup');
assert.match(legacy,/No over-allocated active or paused jobs/,
 'legacy fallback must be safe and describe the active/paused scope');
const report=readFileSync(new URL('../app/src/main/assets/workshop_performance.js',import.meta.url),'utf8');
for(const required of ['v377-overalloc-vehicle','v377-overalloc-kind','v377-overalloc-name','v377-overalloc-exceeded','data-v377-job']){
 assert.ok(report.includes(required),'report must include '+required);
}


// Cross-panel authority: legacy monthly rings must never include unfinished work
// or ID001, and should reuse the V377 completed-only assignment ranking.
assert.match(legacy,/function v75EffRows\(key\)\{const month=v75MonthBounds\(key\)\.key,ranked=window\.zukaitWorkshopPerformance\?\.completedRanking\?\.\(month\)/);
assert.match(report,/completedRanking:month=>allowed\(\)\?completedRanking\(data\(\),month\):\[\]/);
assert.match(report,/window\.v75ChangeEfficiency\(monthInView\)/,'refresh old rings after manager ranking loads');

// Exercise the actual ranking module against mixed normal, ID001,
// repeat, unfinished, after-hours, and cancelled assignments.
const timeSource=readFileSync(new URL('../app/src/main/assets/time_management_rules.js',import.meta.url),'utf8');
const timeUrl='data:text/javascript;base64,'+Buffer.from(timeSource).toString('base64');
const standalone=report.replace("from './time_management_rules.js?v=2026102701'","from '"+timeUrl+"'");
const {completedRanking}=await import('data:text/javascript;base64,'+Buffer.from(standalone).toString('base64'));
const om=(d,h,m=0)=>Date.parse('2026-10-'+String(d).padStart(2,'0')+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00+04:00');
const finished=om(12,11);
const mixed={
 users:[{id:'EMP002',name:'Akhil',role:'Employee',department:'Denter'}],
 jobs:[{no:'JC1'},{no:'JC2'},{no:'JC3'},{no:'ID001'}],
 assign:[
  {id:'A',emp:'EMP002',job:'JC1',suggested:120,completed:true,completedAt:finished},
  {id:'B',emp:'EMP002',job:'JC2',suggested:9000,completed:false},
  {id:'C',emp:'EMP002',job:'JC3',suggested:9000,completed:true,completedAt:finished,rework:true},
  {id:'H',emp:'EMP002',job:'ID001',suggested:0,completed:true,completedAt:finished}
 ],
 sessions:[
  {id:'SA',assignmentId:'A',emp:'EMP002',job:'JC1',start:om(12,9),end:om(12,10)},
  {id:'SB',assignmentId:'B',emp:'EMP002',job:'JC2',start:om(12,10),end:om(12,11)},
  {id:'SC',assignmentId:'C',emp:'EMP002',job:'JC3',start:om(12,8),end:om(12,9)},
  {id:'SH',assignmentId:'H',emp:'EMP002',job:'ID001',start:om(12,15),end:om(12,19)},
  {id:'OT',assignmentId:'A',emp:'EMP002',job:'JC1',start:om(12,19),end:om(12,20)}
 ]
};
const actual=completedRanking(mixed,'2026-10',om(31,19));
assert.equal(actual.length,1);
assert.equal(actual[0].name,'Akhil');
assert.equal(actual[0].jobs,1);
assert.equal(actual[0].suggested,120);
assert.equal(actual[0].actual,60,'ID001, repeat, unfinished and overtime must not change actual productive minutes');
assert.equal(actual[0].efficiency,200);


const employeeHelpers=html.slice(html.indexOf('// Productive reports are per-assignment;'),html.indexOf('function productionReportUI()'));
const exportCode=html.slice(html.indexOf('function exportManagerReport(type)'),html.indexOf('/* V23 Supervisor',html.indexOf('function exportManagerReport(type)')));
assert.ok(employeeHelpers.includes('sessionsForAssignment(a)'),'date filter uses exact assignment sessions');
assert.ok(employeeHelpers.includes("String(a.job).toUpperCase()==='ID001'"),'ID001 excluded from productive rows');
assert.ok(exportCode.includes('reportAssignmentActual(a)'),'employee Excel export uses per-assignment actual');
assert.ok(html.includes('rows=reportRows(from,to)'),'monthly reports use productive assignment filter');

const vm=await import('node:vm');
const seen=[];
const sampleAssign=[
 {id:'J1',job:'12043',emp:'EMP002',suggested:330,completed:true,assignedAt:1},
 {id:'J2',job:'12043',emp:'EMP002',suggested:210,completed:true,assignedAt:2},
 {id:'H1',job:'ID001',emp:'EMP002',suggested:0,completed:true,assignedAt:3},
 {id:'H2',job:'ID001',emp:'EMP002',suggested:0,completed:true,assignedAt:4}
];
const sampleSessions=[
 {id:'S1',assignmentId:'J1',emp:'EMP002',job:'12043',start:100,end:200},
 {id:'S2',assignmentId:'J2',emp:'EMP002',job:'12043',start:150,end:250},
 {id:'S3',assignmentId:'H1',emp:'EMP002',job:'ID001',start:130,end:230}
];
const ctx={
 state:{assign:sampleAssign,sessions:sampleSessions},
 window:{zukaitWorkshopPerformance:{assignmentActual:a=>({J1:400,J2:378}[a.id]??99999)}},
 sessionsForAssignment:a=>sampleSessions.filter(x=>x.assignmentId===a.id),
 document:{getElementById:id=>({empReportPerson:{value:'EMP002'},empReportStatus:{value:'Completed'}}[id]||null)},
 getRange:()=>[0,1000],now:()=>1000,
 fmt:n=>String(Math.round(n))+'m',
 job:no=>({vehicle:'Toyota Land Cruiser',reg:'516.DD'}),
 user:id=>({name:id==='EMP002'?'Akhil':'Manager'}),
 empStatus:()=> 'Finished',
 downloadExcelFile:(filename,headers,rows)=>seen.push({filename,headers,rows}),
 alert:()=>{throw Error('unexpected alert')}
};
vm.runInNewContext(employeeHelpers+'\n'+exportCode+'\nexportManagerReport("employee");',ctx);
assert.equal(seen.length,1,'employee export issued once');
assert.equal(seen[0].rows.length,2,'two assignments, without duplicated ID001');
assert.deepEqual(Array.from(seen[0].rows,x=>x[5]),['400m','378m'],'individual JC12043 durations must differ');
assert.deepEqual(Array.from(seen[0].rows,x=>x[1]),['12043','12043'],'both legitimate assignments retained');

console.log('V377 Workshop Performance layout and unified efficiency ranking: PASS');
