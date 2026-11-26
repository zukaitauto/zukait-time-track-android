import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8').replaceAll('\r\n','\n');
const begin=source.indexOf('function computeLiveStatus('),end=source.indexOf('\n\nfunction employeeTimeTransition',begin);
const optimized=source.slice(begin,end);
const original=optimized.replace('.select("revision,users:data->users,sessions:data->sessions,assign:data->assign,jobs:data->jobs,updated_at,updated_by")','.select("revision,data,updated_at,updated_by")')
 .replace('computeLiveStatus({users:current.users,sessions:current.sessions,assign:current.assign,jobs:current.jobs}, revision,','computeLiveStatus(current.data || {}, revision,');
assert.notEqual(optimized,original);
const fixture={
 users:['WORK','PAUSE','IDLE','OVER','FREE','DONE'].map(id=>({id,name:id,role:'Employee',department:'Workshop'})),
 jobs:[{no:'JC1',vehicle:'QA vehicle',reg:'TEST'},{no:'ID001'}],
 assign:['WORK','PAUSE','OVER','DONE'].map((emp,i)=>({id:'A'+i,emp,job:'JC1',suggested:60,completed:emp==='DONE'})),
 sessions:[
 {id:'S1',emp:'WORK',job:'JC1',assignmentId:'A0',start:100},
 {id:'S2',emp:'PAUSE',job:'JC1',assignmentId:'A1',start:110,end:120,paused:true},
 {id:'S3',emp:'IDLE',job:'ID001',start:130},
 {id:'S4',emp:'OVER',job:'JC1',assignmentId:'A2',start:140,overtime:true},
 {id:'S5',emp:'DONE',job:'JC1',assignmentId:'A3',start:150},
 {id:'old',emp:'WORK',job:'JC1',start:1,end:2},
 {id:'cancelled',emp:'WORK',job:'JC1',start:1000,cancelled:true}],
 estimates:[{financial:'not used in live projection'}],paintPurchasing:{largeHistory:'x'.repeat(10000)}
};
async function run(code,data,stale=false){
 const selected=[],writes=[];let rows=[];
 const ctx={admin:{from(table){const q={
 select(columns){q.columns=columns;selected.push({table,columns});return q},eq(){return q},
 async single(){const result={revision:7,updated_at:'2026-10-19',updated_by:'QA'};
 for(const field of q.columns.split(',')){if(field==='data')result.data=structuredClone(data);const match=field.match(/^(\w+):data->(\w+)$/);if(match)result[match[1]]=structuredClone(data[match[2]]??null)}
 return {data:result}},
 async order(){return {data:rows}},
 async upsert(expected){writes.push({operation:'upsert',rows:structuredClone(expected)});rows=[...rows.map(row=>expected.find(next=>next.employee_id===row.employee_id)||row),...expected.filter(next=>!rows.some(row=>row.employee_id===next.employee_id))];return {}},
 delete(){return{async in(_field,ids){writes.push({operation:'delete',ids});rows=rows.filter(r=>!ids.includes(r.employee_id));return {}}}}
 };return q}},console};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(code)+';this.project=computeLiveStatus;this.load=loadAuthoritativeLiveStatus;',ctx);
 rows=stale?[{employee_id:'REMOVED',status:'Working'}]:structuredClone(ctx.project(data,7,'QA')).map(r=>({...r,updated_at:'2026-10-19'}));
 const result=await ctx.load();return{result:JSON.parse(JSON.stringify(result)),selected,writes:JSON.parse(JSON.stringify(writes))};
}
for(const data of [fixture,{}, {users:null,sessions:null,assign:null,jobs:null}]){
 for(const stale of [false,true]){
 const before=await run(original,data,stale),after=await run(optimized,data,stale);
 assert.deepEqual(after.result,before.result,'live statuses and metadata must remain identical');
 assert.ok(after.writes.filter(w=>w.operation==='upsert').every(w=>w.rows.length<=before.writes.find(b=>b.operation==='upsert')?.rows.length),'selective repair must never upsert more rows than baseline');
 const read=after.selected.find(r=>r.table==='workshop_state');
 assert.ok(!read.columns.split(',').includes('data'),'full snapshot must not be selected');
 assert.match(read.columns,/users:data->users/);
 }
}
const result=await run(optimized,fixture);
assert.deepEqual(Object.fromEntries(result.result.rows.map(r=>[r.employee_id,r.status])),{WORK:'Working',PAUSE:'Paused',IDLE:'ID001',OVER:'Overtime',FREE:'Available',DONE:'Available'});
console.log('Live projection parity passed: Working, Paused, ID001, Overtime, Available, completed/cancelled assignments, empty inputs, and stale-row repairs.');


 // Repeated refreshes at a stable revision must not re-extract JSON history.
 // Exercise real production function source with a deterministic database stub.
 const reads=[],repairWrites=[];
 let clock=100000,revision=7,updated='2026-11-25T06:00:00Z',data=structuredClone(fixture),rows=[];
 const cacheCtx={Date:{now:()=>clock},console,admin:{from(table){const q={
   select(columns){q.columns=columns;reads.push({table,columns});return q},eq(){return q},
   async single(){const result={revision,updated_at:updated,updated_by:'QA'};
     for(const field of q.columns.split(',')){const m=field.match(/^(\w+):data->(\w+)$/);if(m)result[m[1]]=structuredClone(data[m[2]]??null)}
     return {data:result}},
   async order(){return {data:structuredClone(rows)}},
   async upsert(expected){repairWrites.push({operation:'upsert',count:expected.length});rows=[...rows.map(row=>expected.find(next=>next.employee_id===row.employee_id)||row),...expected.filter(next=>!rows.some(row=>row.employee_id===next.employee_id))];return {}},
   delete(){return{async in(_field,ids){repairWrites.push('delete');rows=rows.filter(r=>!ids.includes(r.employee_id));return {}}}}
 };return q}}};
 vm.createContext(cacheCtx);vm.runInContext(stripTypeScriptTypes(optimized)+';this.project=computeLiveStatus;this.load=loadAuthoritativeLiveStatus;',cacheCtx);
 const heavy=()=>reads.filter(x=>x.table==='workshop_state'&&x.columns.includes('data->')).length;
 rows=structuredClone(cacheCtx.project(data,revision,'QA'));
 const first=await cacheCtx.load();
 for(let i=0;i<24;i++){clock+=500;assert.deepEqual(await cacheCtx.load(),first)}
 assert.equal(heavy(),1,'25 same-revision refreshes use one JSON read per warm isolate');
 assert.equal(repairWrites.length,0);
 // A same-revision corrupt or missing row must never be served from cache.
 rows[0].status='CORRUPT';const repairCountBefore=repairWrites.length;const repaired=await cacheCtx.load();assert.equal(heavy(),2);assert.equal(repairWrites.length,repairCountBefore+1,'corrupt single employee requires one repair upsert');assert.equal(repairWrites.at(-1).count,1,'repair must update only the corrupt employee');
 assert.equal(repaired.rows[0].status,first.rows[0].status);
 await cacheCtx.load();assert.equal(heavy(),2);
 rows=rows.slice(1);const missing=await cacheCtx.load();assert.equal(missing.rows.length,first.rows.length);
 assert.equal(heavy(),3);
 await cacheCtx.load();
 // Changed workshop revision and metadata invalidate the shortcut.
 revision++;updated='2026-11-25T06:01:00Z';data.sessions=[];rows=structuredClone(cacheCtx.project(data,revision,'QA'));
 const changed=await cacheCtx.load();assert.equal(changed.revision,8);assert.equal(heavy(),4);
 assert.ok(changed.rows.every(r=>r.status==='Available'));
 clock+=31000;await cacheCtx.load();assert.equal(heavy(),5,'TTL forces periodic full revalidation');
 updated='2026-11-25T06:02:00Z';await cacheCtx.load();assert.equal(heavy(),6,'same revision with changed timestamp revalidates');
 console.log('PASS: 25 stable refreshes require 1 heavy projection read (96% reduction in this synthetic warm-isolate fixture); same-revision corruption/missing rows repaired, revision/metadata changes and TTL revalidated.');
