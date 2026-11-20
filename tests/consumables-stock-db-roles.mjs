import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Isolated PostgreSQL only. Never a production connection.
const db=new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec("create table public.staff_credentials(user_id text primary key,role text not null,department text,active boolean default true,must_change boolean default false)");
await db.exec("create table public.staff_sessions(user_id text references public.staff_credentials(user_id),token_hash text primary key,revoked_at timestamptz)");
await db.exec("create table public.workshop_state(id text primary key,revision bigint default 1,data jsonb not null)");
await db.exec("create schema zukait_mechanical;create table zukait_mechanical.checklists(job_card text primary key);create table zukait_mechanical.intake_jobs(job_card text primary key)");
for(const filename of [
 'CONSUMABLES_STOCK_COMPACT_FOUNDATION.sql',
 'CONSUMABLES_STOCK_COMPACT_RPC.sql',
 'CONSUMABLES_STOCK_MECHANICAL_BATCH.sql',
 'CONSUMABLES_STOCK_MECHANICAL_RETURN.sql',
 'CONSUMABLES_STOCK_MECHANICAL_TOTALS.sql',
 'CONSUMABLES_STOCK_MASTER_LINK.sql',
 'CONSUMABLES_STOCK_LEGACY_PREVIEW.sql'
])await db.exec(readFileSync('supabase/staged/'+filename,'utf8'));

const tables=[
 'zukait_stock_material_keys','zukait_stock_brand_keys',
 'zukait_stock_balances','zukait_stock_reservations',
 'zukait_stock_reservation_lots','zukait_stock_movements',
 'zukait_stock_request_receipts','zukait_stock_mechanical_issues',
 'zukait_stock_mechanical_lines','zukait_stock_mechanical_returns'
];
const procedures=[
 'zukait_stock_command(text,text,text,jsonb)',
 'zukait_stock_mechanical_issue(text,text,jsonb)',
 'zukait_stock_mechanical_return(text,text,jsonb)',
 'zukait_stock_mechanical_returnable(text,text,integer)',
 'zukait_stock_mechanical_job_totals(text,text,integer)',
 'zukait_stock_link_master(text,text,text,text)',
 'zukait_stock_legacy_preview(text,integer)'
];
for(const table of tables){
 const sql=
   "select c.relrowsecurity,"+
   " has_table_privilege('anon','public."+table+"','SELECT') anon_read,"+
   " has_table_privilege('authenticated','public."+table+"','SELECT') user_read,"+
   " has_table_privilege('authenticated','public."+table+"','INSERT') user_insert,"+
   " has_table_privilege('authenticated','public."+table+"','UPDATE') user_update,"+
   " has_table_privilege('authenticated','public."+table+"','DELETE') user_delete,"+
   " has_table_privilege('service_role','public."+table+"','SELECT') svc_read"+
   " from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace"+
   " where n.nspname='public' and c.relname=$1";
 const q=await db.query(sql,[table]);
 assert.equal(q.rows.length,1,table+' exists');
 const row=q.rows[0];
 assert.equal(row.relrowsecurity,true,table+' RLS must be enabled');
 for(const f of ['anon_read','user_read','user_insert','user_update','user_delete'])
  assert.equal(row[f],false,table+' '+f+' must be denied');
 assert.equal(row.svc_read,true,table+' service role requires SELECT');
}
for(const fn of procedures){
 const r=await db.query(
  "select has_function_privilege('anon',$1,'EXECUTE') anon_exec,"+
  " has_function_privilege('authenticated',$1,'EXECUTE') user_exec,"+
  " has_function_privilege('service_role',$1,'EXECUTE') svc_exec",
  ['public.'+fn]);
 assert.equal(r.rows[0].anon_exec,false,fn+' must deny anon');
 assert.equal(r.rows[0].user_exec,false,fn+' must deny authenticated');
 assert.equal(r.rows[0].svc_exec,true,fn+' must allow service_role');
}
await db.exec('set role authenticated');
await assert.rejects(
 db.query('select material_id from public.zukait_stock_material_keys limit 1'),
 /permission denied/i);
await db.exec('reset role');
await db.exec('set role anon');
await assert.rejects(
 db.query("select public.zukait_stock_mechanical_job_totals('forged','JC12500',0)"),
 /permission denied/i);
await db.exec('reset role');

// These fixture grants represent required EXISTING workshop auth/JC grants;
// real production role permissions still require separate acceptance.
await db.exec('grant select on public.staff_sessions,public.staff_credentials to service_role');
await db.exec('grant usage on schema zukait_mechanical to service_role');
await db.exec('grant select on zukait_mechanical.checklists,zukait_mechanical.intake_jobs to service_role');
await db.exec("insert into public.staff_credentials(user_id,role) values('M','Manager'),('MS','Mechanical Supervisor'),('BS','Supervisor'),('EMP','Employee')");
await db.exec("insert into public.staff_sessions(user_id,token_hash) values('M','mgr-token'),('MS','mech-token'),('BS','body-token'),('EMP','employee-token')");
await db.exec("insert into zukait_mechanical.checklists(job_card) values('JC12500')");
await db.exec("insert into public.zukait_stock_material_keys(material_id,unit,department,display_name) values('oil','Liter','Mechanical','Engine Oil')");
await db.exec("insert into public.zukait_stock_brand_keys(brand_id,display_name) values('b','Brand B')");
await db.exec("insert into public.zukait_stock_balances(material_id,brand_id,unit,physical,stock_value) values('oil','b','Liter',10,50)");

await db.exec('set role service_role');
const issue=async(token,id)=>{
 const r=await db.query(
  'select public.zukait_stock_mechanical_issue($1,$2,$3::jsonb) result',
  [token,id,JSON.stringify({jobCard:'JC12500',lines:[
    {materialId:'oil',brandId:'b',quantity:2}]})]);
 return r.rows[0].result;
};
await assert.rejects(issue('body-token','forged-body'),/MECHANICAL_STOCK_FORBIDDEN/);
await assert.rejects(issue('employee-token','forged-employee'),/MECHANICAL_STOCK_FORBIDDEN/);
const saved=await issue('mech-token','mechanical-valid-1');
assert.equal(saved.final,true);
assert.equal(saved.lineCount,1);
const totals=await db.query(
 'select public.zukait_stock_mechanical_job_totals($1,$2,$3) result',
 ['mech-token','JC12500',0]);
assert.equal(Number(totals.rows[0].result.netCost),10);
await db.exec('reset role');

await db.exec("update public.staff_sessions set revoked_at=now() where token_hash='mech-token'");
await db.exec('set role service_role');
await assert.rejects(issue('mech-token','revoked-attempt'),/MECHANICAL_STOCK_FORBIDDEN/);
await db.exec('reset role');
assert.equal((await db.query('select count(*) n from public.zukait_stock_mechanical_issues')).rows[0].n,1);
console.log('SECURITY PASS: direct anonymous/authenticated access denied; scoped service_role works; Bodyshop, Employee and revoked sessions denied');
await db.close();
