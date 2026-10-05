const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/workshop_overview.js','utf8');
let listeners=[],saved=0,lastModal='';
const state={jobs:[{no:'12001',vehicle:'Nissan Versa',reg:'AA 123',status:'Delivered'},{no:'12002',delivered:true}],assign:[{id:'a1',job:'12001',emp:'e1',suggested:100,completed:true},{id:'a2',job:'12001',emp:'e2',suggested:60,completed:true,rework:true},{id:'a3',job:'12001',emp:'e3',suggested:30,cancelled:true},{id:'a4',job:'12002',emp:'e1',suggested:10,completed:true}],sessions:[{id:'s1',emp:'e1',job:'12001',start:1000,end:2000}],overdueTimeReviews:[]};
const window={zukaitV2:{efficiency:{assignmentActualMinutes:(_s,a)=>a.id==='a1'?125:a.id==='a2'?90:a.id==='a3'?70:8}},sessionNormalMinutes:()=>30,openModal(html){lastModal=html},closeModal(){},dispatchEvent(){}};
const document={head:{appendChild(){}},body:{},addEventListener(_type,fn){listeners.push(fn)},createElement(){return {style:{},dataset:{}}},getElementById(){return null},querySelector(){return null},querySelectorAll(){return []}};
class MutationObserver{observe(){}}
const sandbox={window,document,MutationObserver,navigator:{onLine:true},state,me:{id:'m1',name:'Manager One',role:'Manager'},users:[{id:'e1',name:'VINAYAN'},{id:'e2',name:'ZAHEER'},{id:'e3',name:'SURAB'}],setTimeout(){},setInterval(){},console,Event:function(){},Date,Map,Set,JSON,Math,Number,String,Array,Promise,alert(){},save(){saved++},uid(){return 'review-1'},F:m=>`${m}m`,totalForAssignment:()=>0,sessionNormalMinutes:()=>30};
vm.runInNewContext(source,sandbox);
const api=window.zukaitWorkshopOverview,rows=api.overdueTimeRows();
assert.equal(rows.length,1,'normal work above approved suggestion appears');
assert.equal(rows[0].employee,'VINAYAN');assert.equal(rows[0].suggested,100);assert.equal(rows[0].actual,125);assert.equal(rows[0].exceeded,25);
state.overdueTimeReviews.push({job:'12001',assignmentId:'a1',signature:rows[0].signature});assert.equal(api.overdueTimeRows().length,0,'same reviewed signature stays hidden');
state.assign[0].suggested=110;assert.equal(api.overdueTimeRows().length,1,'changed approved time creates a fresh review');
const next=api.overdueTimeRows()[0],button={dataset:{workshopAction:'overdue-confirm',job:'12001',assignment:'a1',signature:next.signature}};
for(const listener of listeners)listener({target:{closest(selector){return selector==='[data-workshop-action="detail-360"]'?null:button}},preventDefault(){},stopPropagation(){}});
assert.equal(state.overdueTimeReviews.length,2,'confirmation is saved in review history');
assert.equal(state.overdueTimeReviews[1].reviewerName,'Manager One');assert.ok(state.overdueTimeReviews[1].reviewedAt>0);assert.equal(saved,1);
assert.equal(api.overdueTimeRows().length,0,'confirmed current signature leaves pending list');
state.sessions[0].end+=60000;assert.equal(api.overdueTimeRows().length,1,'corrected work-time record creates a new review');
state.jobs[0].status='Completed';assert.equal(api.overdueTimeRows().length,0,'completed but undelivered vehicles stay out of delivered review');
state.jobs[0].status='Open';assert.equal(api.overdueTimeRows().length,0,'open vehicles stay out of delivered review');
state.jobs[0].delivered=true;state.assign[1].completed=false;assert.equal(api.overdueTimeRows().length,1,'open repeat work does not hide delivered original work');
state.assign[0].completed=false;assert.equal(api.overdueTimeRows().length,1,'delivered historical work does not require old assignment completion flags');
state.assign[0].suggested=0;assert.equal(api.overdueTimeRows().length,0,'zero suggested time is not an exceeded-suggestion review');
assert.match(source,/\['Running Work Attention',/);assert.doesNotMatch(source,/\['Delivered Vehicle Time Review',|\['Overdue Time',|\['Over allocated',|\['Attention',/);
// The Manager hub must use this same authoritative list and review detail.
state.assign[0].suggested=110;
const updates=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');
sandbox.openModal=window.openModal;sandbox.fmt=m=>`${m}m`;
vm.runInNewContext(updates.slice(updates.indexOf('/* V273 MANAGER TIME ATTENTION')),sandbox);
window.v273OpenTimeAttention('completed');assert.match(lastModal,/Delivered Vehicle Time Review/);assert.match(lastModal,/VINAYAN/);assert.match(lastModal,/REVIEW/);
assert.equal(window.v273RunningAttentionCount(),0,'delivered vehicles never enter the running list');
window.v273OpenCompletedOverdueReview('a1');assert.match(lastModal,/Delivered Vehicle Time Review/);assert.match(lastModal,/CONFIRM REVIEW/);assert.match(lastModal,/Back to Delivered Reviews/);
console.log('PASS: overdue list filters, duty-time values, manager confirmation, reviewer/date history, and correction re-review.');

// Running work issues merge by JC and retain all reasons in one list.
state.jobs.push({no:'13001',vehicle:'Running Car',reg:'BB 321'},{no:'13002',vehicle:'Unassigned Car'});
const active={id:'r1',job:'13001',emp:'e1',suggested:60,completed:false};
state.assign.push(active,{id:'r2',job:'13001',emp:'e2',suggested:60,completed:false});
window.zukaitV2.efficiency.assignmentActualMinutes=(_s,a)=>a.id==='r1'?90:a.id==='a1'?125:20;
window.v74AttentionRows=()=>[{a:active,rs:['Over allocated by 30m','Paused','Open 5 days']}];
assert.equal(window.v273RunningAttentionCount(),2,'one JC with multiple issues plus an unassigned JC count once each');
window.v273OpenTimeAttention('running');assert.match(lastModal,/Running Work Attention/);assert.match(lastModal,/Suggested time exceeded by 30m/);assert.match(lastModal,/Paused/);assert.match(lastModal,/Open 5 days/);assert.match(lastModal,/No technician assigned/);
assert.doesNotMatch(lastModal,/v273-tabs|Ongoing Time Exceeded|Completed Time Review/);
assert.equal((lastModal.match(/JC 13001/g)||[]).length,1,'overrun and paused issues share one JC row');
assert.doesNotMatch(lastModal,/12001/,'delivered review is separate from running attention');
