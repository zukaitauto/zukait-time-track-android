import fs from 'node:fs';import assert from 'node:assert/strict';
const source=fs.readFileSync('app/src/main/assets/qc_delivery_rules.js','utf8');assert.equal(source,fs.readFileSync('supabase/functions/workshop-api/qc_delivery_rules.js','utf8'));
const {qcTransition:transition,qcStatus:status,preserveQcAuthority:protect}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const copy=x=>JSON.parse(JSON.stringify(x));const vinayan={id:'SUP002',name:'Vinayan',role:'Supervisor'},shine={id:'SUP001',name:'Shine',role:'Supervisor'},manager={id:'MGR001',role:'Manager'};
const initial={jobs:[{no:'JC1',status:'Completed',qcPassed:true}],assign:[{id:'A1',job:'JC1',emp:'EMP1',completed:true,completedAt:50}],sessions:[{id:'S1',job:'JC1',start:10,end:50}],consumables:{actuals:[{id:'C1'}]}};
let data=copy(initial),time=100;
const run=(user,operation,result='PASS',reason='')=>transition(data,user,{jobCard:'JC1',operation,result,reason,expectedQcRevision:data.jobs[0].qcWorkflow?.revision||0},time++);
assert.equal(run(manager,'DELIVER').code,'qc_permission_denied');assert.equal(run(shine,'PAINTING_QC').code,'qc_permission_denied');assert.equal(run({...vinayan,id:'EMP006',role:'Employee'},'PAINTING_QC').code,'qc_permission_denied');
assert.equal(run(shine,'FINAL_QC').code,'painting_qc_required');assert.equal(run(shine,'DELIVER').code,'both_qc_required');assert.equal(run(vinayan,'PAINTING_QC','FAIL').code,'qc_failure_reason_required');assert.deepEqual(data,initial,'Rejected operations must not mutate workshop data');
let r=run(vinayan,'PAINTING_QC','FAIL','Paint dust');assert.equal(r.ok,true);data=r.data;assert.equal(status(data,data.jobs[0]).painting,false);assert.deepEqual(data.assign,initial.assign,'QC failure does not issue repeat or deduct hours');
r=run(vinayan,'PAINTING_QC');data=r.data;assert.equal(status(data,data.jobs[0]).painting,true);
r=run(shine,'FINAL_QC','FAIL','Panel alignment');data=r.data;assert.equal(status(data,data.jobs[0]).deliveryReady,false);
// Existing repeat flow issues an independent assignment; every earlier approval becomes invalid.
data.assign.push({id:'R1',job:'JC1',emp:'EMP2',completed:false,rework:true});assert.equal(run(shine,'FINAL_QC').code,'work_not_finished');data.assign[1].completed=true;data.assign[1].completedAt=120;assert.equal(status(data,data.jobs[0]).painting,false);assert.equal(run(shine,'FINAL_QC').code,'painting_qc_required');
data=run(vinayan,'PAINTING_QC').data;data=run(shine,'FINAL_QC').data;assert.equal(status(data,data.jobs[0]).deliveryReady,true);
assert.equal(transition(data,shine,{jobCard:'JC1',operation:'DELIVER',expectedQcRevision:0},200).code,'qc_conflict');
data=run(shine,'DELIVER').data;assert.equal(data.jobs[0].delivered,true);assert.equal(data.jobs[0].deliveredBy,'SUP001');assert.equal(data.jobs[0].qcWorkflow.history.length,6);assert.equal(run(shine,'DELIVER').code,'already_delivered');assert.deepEqual(data.consumables,initial.consumables);
const forged=copy(initial);forged.jobs[0].delivered=true;forged.jobs[0].status='Delivered';forged.jobs[0].qcWorkflow={painting:{result:'PASS'},final:{result:'PASS'}};protect(forged,initial);assert.equal(forged.jobs[0].delivered,undefined);assert.equal(forged.jobs[0].qcWorkflow,undefined);
const stale=copy(data);delete stale.jobs[0].qcWorkflow;stale.jobs[0].delivered=false;protect(stale,data);assert.deepEqual(stale.jobs[0].qcWorkflow,data.jobs[0].qcWorkflow);assert.equal(stale.jobs[0].delivered,true);
const active=copy(initial);active.sessions.push({id:'S2',job:'JC1',start:55});assert.equal(transition(active,vinayan,{jobCard:'JC1',operation:'PAINTING_QC',result:'PASS',expectedQcRevision:0},200).code,'work_not_finished');
const api=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');assert.match(api,/candidate = preserveQcAuthority\(candidate, current.data\)/);assert.match(api,/action === "qc_delivery"[\s\S]*p_expected_revision:Number\(current.revision/);
console.log('QC server rules passed: designated accounts, order, failures, unchanged repeat accounting, active work, repeat invalidation, stale devices, delivery audit and concurrency.');
// Execute the actual endpoint block with concurrent DB revisions, without real garage writes.
const block=api.slice(api.indexOf('    if (action === "qc_delivery") {'),api.indexOf('    if (action === "revision") {'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const endpoint=new AsyncFunction('admin','qcTransition','computeLiveStatus','reply','user','body','action',block);
let reads=0,commits=0,saved;
const admin={from(){return {select(){return this},eq(){return this},async single(){reads++;return {data:{revision:reads,data:copy(initial)}}}}},async rpc(name,args){assert.equal(name,'zukait_commit_workshop_state_v2');commits++;saved=args;return {data:commits===1?{ok:false,code:'conflict'}:{ok:true,revision:3}}}};
const request={jobCard:'JC1',operation:'PAINTING_QC',result:'PASS',expectedQcRevision:0};
const response=await endpoint(admin,transition,()=>[],(body,status=200)=>({body,status}),vinayan,request,'qc_delivery');assert.equal(response.body.ok,true);assert.equal(commits,2);assert.equal(saved.p_expected_revision,2);assert.equal(saved.p_changed_by,'SUP002');
// Another employee reopens work between read and commit: the retry must block QC.
reads=0;commits=0;admin.from=()=>({select(){return this},eq(){return this},async single(){reads++;const d=copy(initial);if(reads>1)d.assign[0].completed=false;return {data:{revision:reads,data:d}}}});admin.rpc=async()=>{commits++;return {data:{ok:false,code:'conflict'}}};
const conflict=await endpoint(admin,transition,()=>[],(body,status=200)=>({body,status}),vinayan,request,'qc_delivery');assert.equal(conflict.body.code,'work_not_finished');assert.equal(commits,1);
console.log('QC endpoint CAS race tests passed: retries unrelated changes, blocks concurrent reopened work.');
const vm=await import('node:vm');const ui=fs.readFileSync('app/src/main/assets/qc_delivery.js','utf8');
for(const person of [vinayan,shine,manager]){
 const ctx={qcStatus:status,state:copy(initial),me:person,window:{addEventListener(){}},document:{getElementById(){return null},createElement(){return{}},head:{appendChild(){}}},Date,console,alert(){},openModal(){}};
 vm.runInNewContext(ui.replace(/^import[^\n]+\n/, '')+'\nwindow.testRow=row;',ctx);
 let html=ctx.window.testRow(initial.jobs[0]);
 assert.equal(html.includes('Painting QC</button>'),person.id==='SUP002');assert.equal(html.includes('Final QC</button>'),false);assert.equal(html.includes('Mark Delivered</button>'),false,'QC queue must not contain delivery action');
 ctx.state=copy(data);ctx.state.jobs[0].delivered=false;html=ctx.window.testRow(ctx.state.jobs[0]);assert.equal(html.includes('Final QC</button>'),false,'Final-passed vehicle must leave QC queue');assert.equal(html.includes('Mark Delivered</button>'),false);const readyHtml=ctx.window.testRow(ctx.state.jobs[0],'ready');assert.equal(readyHtml.includes('Mark Delivered</button>'),person.role==='Supervisor');assert.equal(/v213AskDelivered[^>]+disabled/.test(readyHtml),false);
}

assert.match(ui,/function qcQueueMatches\(j\)/,'QC queue must have an explicit stage filter');
assert.match(ui,/function readyMatches\(j\)/,'Ready to Deliver must be a separate filter');
assert.match(ui,/window\.zukaitOpenReadyToDeliver=\(\)=>openPage\('ready'\)/,'Ready to Deliver must have its own launcher');
assert.match(ui,/<b>QC<\/b><small>Painting \/ Final quality check<\/small>/,'QC launcher must be separate from delivery');
assert.match(ui,/<b>Ready to Deliver<\/b><small>Both QC stages passed<\/small>/,'Ready to Deliver launcher must be separate from QC');
assert.match(ui,/function queueSince\(j\)/,'QC queue must sort by waiting age');
assert.match(ui,/function readySince\(j\)/,'Ready to Deliver must sort by ready age');
assert.match(ui,/qc-fail-badge/,'QC failures must show a visible FAIL badge');
assert.match(ui,/Painting QC ✓/,'Ready to Deliver must show Painting QC pass state');
assert.match(ui,/Final QC ✓/,'Ready to Deliver must show Final QC pass state');
assert.match(ui,/lastNotice=operation==='DELIVER'/,'QC actions must return with a short non-blocking result notice');
assert.match(ui,/const dn=jobs\(\)\.filter\(j=>j&&j\.delivered/,'Delivered Vehicles must have a live count');


assert.match(fs.readFileSync('.github/workflows/pages.yml','utf8'),/cp app\/src\/main\/assets\/qc_delivery_rules.js _site\/qc_delivery_rules.js/);
assert.match(fs.readFileSync('app/src/main/assets/offline_test.html','utf8'),/<script type="module" src="qc_delivery.js\?v=218"><\/script>/);
console.log('QC dashboard role buttons and Web/Android module packaging passed.');
