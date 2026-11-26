import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

// Run the real authoritative projection loader with the SQL candidate's
// per-employee revision semantics, without connecting to any live database.
const source=fs.readFileSync('supabase/functions/workshop-api/index.ts','utf8');
const start=source.indexOf('function computeLiveStatus(');
const end=source.indexOf('\n\nfunction employeeTimeTransition',start);
assert.ok(start>=0&&end>start);
const code=stripTypeScriptTypes(source.slice(start,end));
const data={
 users:[{id:'E1',name:'One',role:'Employee'},{id:'E2',name:'Two',role:'Employee'},{id:'E3',name:'Three',role:'Employee'}],
 sessions:[],assign:[],jobs:[]
};
async function scenario(selective,mutate){
 const writes=[];let rows=[];
 const ctx={console,Deno:{env:{get:()=>selective?'true':undefined}},admin:{from(table){
 const q={select(columns){q.columns=columns;return q},eq(){return q},
 async single(){const out={revision:11,updated_at:'QA',updated_by:'QA'};for(const field of q.columns.split(',')){const m=field.match(/^(\w+):data->(\w+)$/);if(m)out[m[1]]=data[m[2]];}return {data:out}},
 async order(){return {data:structuredClone(rows)}},
 async upsert(incoming){writes.push(incoming.map(x=>x.employee_id));rows=[...rows.filter(x=>!incoming.some(y=>y.employee_id===x.employee_id)),...incoming];return {}},
 delete(){return{async in(_key,ids){rows=rows.filter(x=>!ids.includes(x.employee_id));return {}}}}
 };return q}}};
 vm.createContext(ctx);vm.runInContext(code+';this.project=computeLiveStatus;this.load=loadAuthoritativeLiveStatus;',ctx);
 rows=structuredClone(ctx.project(data,11,'QA'));
 for(const row of rows)row.state_revision=10;
 mutate?.(rows);
 const result=await ctx.load();
 return {writes,rows:result.rows};
}
const selective=await scenario(true);
assert.equal(selective.writes.length,0,'older but valid per-employee revisions must not be rewritten');
assert.ok(selective.rows.every(r=>r.state_revision===10));
const strict=await scenario(false);
assert.equal(strict.writes.length,1,'default strict mode must repair revision-only differences');
assert.equal(strict.writes[0].length,3);
const corrupt=await scenario(true,rows=>{rows[1].status='Working'});
assert.deepEqual(corrupt.writes,[['E2']],'corrupt employee must be repaired selectively');
const future=await scenario(true,rows=>{rows[2].state_revision=12});
assert.deepEqual(future.writes,[['E3']],'future employee revision must be repaired');
const invalid=await scenario(true,rows=>{rows[0].state_revision=0});
assert.deepEqual(invalid.writes,[['E1']],'invalid employee revision must be repaired');
console.log('PASS: actual API loader preserves valid older row revisions only when opt-in; strict default, corruption, future and invalid revision repairs verified.');
