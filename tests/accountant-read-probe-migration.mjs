import fs from 'node:fs';import assert from 'node:assert/strict';import {accountantDb} from './helpers/accountant-db.mjs';
const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_accountant_read_snapshot_probe.sql'));assert.ok(file);const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');const db=await accountantDb();
try{
 const before=(await db.query("select md5(pg_get_functiondef('public.zukait_accountant_context(text)'::regprocedure)) hash")).rows[0].hash;
 await db.exec(sql);assert.equal((await db.query("select md5(pg_get_functiondef('public.zukait_accountant_context(text)'::regprocedure)) hash")).rows[0].hash,before);
 const probe=(await db.query("select zukait_accountant_read_snapshot('A') result")).rows[0].result;assert.equal(probe.role,'Accountant');assert.ok(probe.snapshot);assert.ok(probe.instance);
 await assert.rejects(db.exec(sql),/already_exists/);await db.exec('rollback');
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.zukait_accountant_read_snapshot(text)','execute') permitted",[role])).rows[0].permitted,false);
 await db.exec("drop function public.zukait_accountant_read_snapshot(text);create or replace function public.zukait_accountant_context(p_actor_id text) returns jsonb language sql security invoker set search_path=public as $$select '{}'::jsonb$$;");
 await assert.rejects(db.exec(sql),/baseline_changed/);await db.exec('rollback');assert.equal((await db.query("select to_regprocedure('public.zukait_accountant_read_snapshot(text)') is null absent")).rows[0].absent,true);
 console.log('PASS staging migration preserves existing context, enforces service-only stable invoker, rejects duplicate/drifted baselines atomically.');
}finally{await db.close()}
