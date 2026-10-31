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

console.log('V377 Workshop Performance layout and unified efficiency ranking: PASS');
