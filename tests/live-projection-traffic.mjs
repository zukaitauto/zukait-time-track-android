import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
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
 async upsert(expected){writes.push({operation:'upsert',rows:structuredClone(expected)});rows=structuredClone(expected);return {}},
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
 assert.deepEqual(after.writes,before.writes,'projection repairs must remain identical');
 const read=after.selected.find(r=>r.table==='workshop_state');
 assert.ok(!read.columns.split(',').includes('data'),'full snapshot must not be selected');
 assert.match(read.columns,/users:data->users/);
 }
}
const result=await run(optimized,fixture);
assert.deepEqual(Object.fromEntries(result.result.rows.map(r=>[r.employee_id,r.status])),{WORK:'Working',PAUSE:'Paused',IDLE:'ID001',OVER:'Overtime',FREE:'Available',DONE:'Available'});
console.log('Live projection parity passed: Working, Paused, ID001, Overtime, Available, completed/cancelled assignments, empty inputs, and stale-row repairs.');

