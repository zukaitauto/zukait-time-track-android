// Logical database recovery rehearsal for generated disposable PostgreSQL fixtures.
// Never accepts a production database name or an external PostgreSQL host.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
const exec=promisify(execFile),quote=s=>'"'+s.replaceAll('"','""')+'"';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function signature(db) {
 const tables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
 const data=[];
 for(const {tablename} of tables){
  const rows=await db.query(`select count(*)::int as count, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) as digest from public.${quote(tablename)} t`);
  data.push({table:tablename,...rows.rows[0]});
 }
 const sequences=[];
 for(const {sequencename} of (await db.query("select sequencename from pg_sequences where schemaname='public' order by sequencename")).rows){
  sequences.push({name:sequencename,...(await db.query(`select last_value::text,is_called from public.${quote(sequencename)}`)).rows[0]});
 }
 const schema=await db.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity,
  (select jsonb_agg(jsonb_build_array(role_name,priv,has_table_privilege(role_name,c.oid,priv)) order by role_name,priv)
   from unnest(array['anon','authenticated','service_role']) role_name,
   unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) priv) privileges
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`);
 const functions=await db.query(`select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname,args`);
 const constraints=await db.query(`select c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k
  join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,k.conname`);
 const triggers=await db.query(`select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t
  join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`);
 return {data,sequences,schema:schema.rows,functions:functions.rows,constraints:constraints.rows,triggers:triggers.rows};
}
export async function rehearseRecovery({admin,control,config,database,replays}) {
 assert.equal(process.env.ZUKAIT_RECEPTION_ISOLATED,'1');
 assert.ok(['127.0.0.1','localhost','::1'].includes(config.host));
 assert.match(database,/^zukait_reception_qa_[a-f0-9]{32}$/);
 const container=process.env.ZUKAIT_POSTGRES_CONTAINER;
 assert.match(container||'',/^[a-f0-9]{12,64}$/,'A disposable PostgreSQL service container ID is required');
 const version=await exec('docker',['exec',container,'pg_dump','--version']);assert.match(version.stdout,/PostgreSQL\) 17\./);
 const before=await signature(control);
 assert.ok(before.data.some(t=>t.table==='workshop_reception_commands'&&t.count>0));
 const state=(await control.query("select data from workshop_state where id='main'")).rows[0].data;
 assert.ok(state.expenses?.length&&state.consumables?.length&&state.sessions?.length,'Nonempty preservation fixtures required');
 const {stdout:dump}=await exec('docker',['exec',container,'pg_dump','-U','postgres','--format=custom','--no-owner',database],{encoding:'buffer',maxBuffer:64*1024*1024});
 assert.equal(dump.subarray(0,5).toString(),'PGDMP');
 const restoredName='zukait_recovery_qa_'+randomUUID().replaceAll('-','');
 let restored;
 await admin.query(`create database ${quote(restoredName)}`);
 try {
  // Stream the private synthetic dump directly; never publish it as a CI artifact.
  await new Promise((resolve,reject)=>{
   const child=execFile('docker',['exec','-i',container,'pg_restore','-U','postgres','--clean','--if-exists','--single-transaction','--no-owner','--dbname',restoredName],{maxBuffer:1024*1024},error=>error?reject(error):resolve());
   child.stdin.on('error',reject);child.stdin.end(dump);
  });
  restored=new pg.Client({...config,database:restoredName});await restored.connect();
  const after=await signature(restored);assert.deepEqual(after,before,'Restored rows, histories, sequences, RLS, grants, functions, constraints and triggers must match');
  for(const {actor,command} of replays){
   await restored.query('set role service_role');
   const result=(await restored.query('select zukait_reception_command($1,$2::jsonb) result',[actor,JSON.stringify(command)])).rows[0].result;
   assert.equal(result.duplicate,true,'Restored command receipts must deduplicate an old device retry');
   await restored.query('reset role');
  }
  assert.deepEqual(await signature(restored),before,'Post-restore retries must not change recovered data or sequences');
  console.log(`PASS database dump/restore: ${before.data.length} tables; rows, nonempty financial/work histories, sequences, RLS/grants, functions and guards identical; ${replays.length} old UUID retries deduplicated. Signature ${hash(before)}`);
 } finally {
  await restored?.end();await admin.query(`drop database if exists ${quote(restoredName)}`);
 }
}
