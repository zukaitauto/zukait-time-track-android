import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const schema=readFileSync('supabase/staged/CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql','utf8');
const mechanical=readFileSync('supabase/staged/CONSUMABLES_STOCK_MECHANICAL_BATCH.sql','utf8');
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text,department text,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create schema zukait_mechanical;create table zukait_mechanical.checklists(job_card text primary key);create table zukait_mechanical.intake_jobs(job_card text primary key)");
await db.exec(schema);
await db.exec(mechanical);
await db.exec("insert into public.staff_credentials(user_id,role,department) values ('MGR','Manager','All'),('MSUP','Mechanical Supervisor','Mechanic'),('SUP','Supervisor','Painter'),('EMP','Employee','Mechanic')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values ('MGR','manager'),('MSUP','mechanical'),('SUP','bodyshop'),('EMP','employee')");
await db.exec("insert into zukait_mechanical.checklists(job_card) values('JC12500')");
await db.exec("insert into zukait_mechanical.intake_jobs(job_card) values('JC12501')");
await db.exec("insert into public.zukait_stock_material_keys(material_id,unit) values('oil5w30','Liter'),('wd40','Piece')");
await db.exec("insert into public.zukait_stock_brand_keys(brand_id) values('a'),('b')");
await db.exec("insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,stock_value) values ('oil5w30','a','Liter',20,100),('oil5w30','b','Liter',10,70),('wd40','a','Piece',5,7.5)");
let n=0;
const issue=async(token,data,request='mech-test-'+(++n))=>{
 const r=await db.query('select public.zukait_stock_mechanical_issue($1,$2,$3::jsonb) as result',
   [token,request,JSON.stringify(data)]);
 return r.rows[0].result;
};
const approx=(x,y)=>assert.ok(Math.abs(Number(x)-y)<0.00001,x+' != '+y);
const payload={jobCard:'JC12500',kind:'issued',lines:[
 {materialId:'oil5w30',brandId:'a',quantity:2},
 {materialId:'oil5w30',brandId:'b',quantity:3},
 {materialId:'wd40',brandId:'a',quantity:2}
]};
await assert.rejects(issue('bodyshop',payload),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(issue('employee',payload),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(issue('mechanical',{...payload,jobCard:'JC12599'}),/MECHANICAL_JOB_NOT_FOUND/);
const initial=await issue('mechanical',payload,'one-issue');
assert.equal(initial.lineCount,3);
assert.equal(initial.final,true);
approx(initial.totalCost,34);
const repeated=await issue('mechanical',payload,'one-issue');
assert.deepEqual(repeated,initial,'retries must return the same receipt');
await assert.rejects(issue('mechanical',{...payload,kind:'additional'},'one-issue'),/REQUEST_ID_CONFLICT/);
let lines=await db.query('select material_id,brand_id,quantity,locked_unit_cost,locked_cost from public.zukait_stock_mechanical_lines order by id');
assert.equal(lines.rows.length,3);
assert.deepEqual(lines.rows.map(x=>x.material_id+'|'+x.brand_id),['oil5w30|a','oil5w30|b','wd40|a']);
approx(lines.rows[0].locked_unit_cost,5);
approx(lines.rows[1].locked_unit_cost,7);
approx(lines.rows[2].locked_unit_cost,1.5);
let balances=await db.query("select brand_id,physical,stock_value from public.zukait_stock_balances where material_id='oil5w30' order by brand_id");
approx(balances.rows[0].physical,18);
approx(balances.rows[0].stock_value,90);
approx(balances.rows[1].physical,7);
approx(balances.rows[1].stock_value,49);
const one=await db.query("select physical,stock_value from public.zukait_stock_balances where material_id='wd40'");
approx(one.rows[0].physical,3);
approx(one.rows[0].stock_value,4.5);
const tooMuch={jobCard:'JC12500',lines:[
  {materialId:'oil5w30',brandId:'a',quantity:2},
  {materialId:'oil5w30',brandId:'b',quantity:90}]};
await assert.rejects(issue('mechanical',tooMuch),/INSUFFICIENT_STOCK/);
assert.equal((await db.query('select count(*) as n from public.zukait_stock_mechanical_issues')).rows[0].n,1,'all-or-nothing rejects entire batch');
await assert.rejects(issue('mechanical',{jobCard:'JC12500',lines:[
  {materialId:'wd40',brandId:'a',quantity:0.5}]}),/PIECE_WHOLE_REQUIRED/);
await assert.rejects(issue('mechanical',{jobCard:'JC12500',lines:[
  {materialId:'oil5w30',brandId:'a',quantity:1},
  {materialId:'oil5w30',brandId:'a',quantity:1}]}),/DUPLICATE_MATERIAL_BRAND/);
const second=await issue('manager',{jobCard:'JC12501',kind:'additional',lines:[
  {materialId:'oil5w30',brandId:'a',quantity:1}]});
assert.equal(second.final,true);
const movements=await db.query("select count(*) as n from public.zukait_stock_movements where action='MECHANICAL_ISSUE'");
assert.equal(movements.rows[0].n,4,'one small movement per brand/line only');
assert.equal((await db.query('select count(*) as n from public.zukait_stock_request_receipts')).rows[0].n,2);
await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='mechanical'");
await assert.rejects(issue('mechanical',payload),/MECHANICAL_STOCK_FORBIDDEN/);
const legacy=await db.query("select count(*) as n from information_schema.tables where table_schema='public' and table_name='workshop_state'");
assert.equal(legacy.rows[0].n,0,'atomic issuing must not need workshop_state');
console.log('Mechanical stock: atomic multi-brand final issue, locked costs, no double issue, role/JC gate, and no snapshot PASSED');
await db.close();
