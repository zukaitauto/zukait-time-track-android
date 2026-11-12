// In-memory PostgreSQL only: no connection URL or production access.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const native=process.env.ZUKAIT_COMPACT_NATIVE==='1';let db,admin,client,database;
if(native){
 const {default:pg}=await import('pg');const host=process.env.PGHOST||'127.0.0.1';assert.ok(['127.0.0.1','localhost','::1'].includes(host),'Loopback fixture only');
 const cfg={host,port:Number(process.env.PGPORT||5432),user:'postgres',password:process.env.PGPASSWORD};admin=new pg.Client({...cfg,database:'postgres'});await admin.connect();database='compact_qa_'+randomUUID().replaceAll('-','');await admin.query('create database "'+database+'"');client=new pg.Client({...cfg,database});await client.connect();db={exec:s=>client.query(s),query:(...a)=>client.query(...a)};
 assert.ok(Number((await db.query('show server_version_num')).rows[0].server_version_num)>=170000&&Number((await db.query('show server_version_num')).rows[0].server_version_num)<180000);
 for(const role of ['anon','authenticated','service_role'])if(!(await db.query('select 1 from pg_roles where rolname=$1',[role])).rows.length)await db.exec('create role '+role+' nologin'+(role==='service_role'?' bypassrls':''));
}else{const {PGlite}=await import('@electric-sql/pglite');db=new PGlite();}
try{
 let baseline=fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8');baseline=native?baseline.replace(/create role (anon|authenticated|service_role)[^;]+;/g,''):baseline.replace('create extension if not exists pgcrypto;','');await db.exec(baseline);
 for(const f of fs.readdirSync('supabase/migrations').filter(f=>/workshop_(compact_history_foundation|history_read_compatibility|history_array_patch_experiment|compact_array_patch_capture|history_rpc_compatibility)\.sql$/.test(f)).sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.query("insert into workshop_state(id,revision,data,updated_by) values('main',1,$1::jsonb,'QA')",[JSON.stringify({jobs:Array.from({length:100},(_,i)=>({no:'QA'+i,vehicle:'Synthetic vehicle '+i,notes:'Synthetic fixture only '.repeat(8)})),assign:[{id:'QA-A',job:'QA1',emp:'QA-E',suggested:60}],sessions:[],users:[],expenses:[]})]);
 for(const name of ['workshop_compact_history_qa','workshop_dual_history_compatibility_qa','workshop_history_read_compatibility_qa','workshop_reception_mechanical_history_qa','workshop_compact_history_growth_qa','workshop_compact_history_integrity_qa','workshop_history_array_patch_qa','workshop_compact_array_patch_capture_qa','workshop_history_rpc_reader_qa','workshop_compact_real_save_qa','workshop_history_mode_rollback_qa']){
  await db.exec("update zukait_history.configuration set mode='dual' where singleton=true");
  await db.exec(fs.readFileSync('supabase/tests/'+name+'.sql','utf8'));console.log('PASS '+name);
 }
}catch(e){console.error(e.message);process.exitCode=1}finally{if(native){await client.end();await admin.query('drop database "'+database+'"');await admin.end()}else await db.close()}
