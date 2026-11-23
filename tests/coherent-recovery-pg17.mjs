// ZUKAIT: synthetic-only coherent PG17 app backup/restore test, localhost Docker.
// NEVER accesses Supabase production. One pg_dump transaction covers public and
// both private app schemas. Confirms Vehicle audit FKs survive together.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
assert.equal(process.env.ZUKAIT_RECOVERY_NATIVE,'1');
const host=process.env.PGHOST||'127.0.0.1';
assert.equal(host,'127.0.0.1','Refuse non-loopback host');
assert.ok(!process.env.DATABASE_URL&&!process.env.SUPABASE_URL&&!process.env.SUPABASE_DB_URL);
assert.equal(process.env.PGPASSWORD,'synthetic_ci_only_password','Only synthetic credentials allowed');
const cfg={host,port:5432,user:'postgres',password:process.env.PGPASSWORD,connectionTimeoutMillis:5000};
const prefix='zukait_coherent_qa_'+randomUUID().replaceAll('-','').slice(0,14);
const src=prefix+'_src',dst=prefix+'_dst';
const dir=mkdtempSync(path.join(os.tmpdir(),'zukait-coherent-qa-'));
const archive=path.join(dir,'coherent.dump');
const admin=new pg.Client({...cfg,database:'postgres'});
let open=false;
function docker(args){
  const r=spawnSync('docker',args,{encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  if(r.error||r.status!==0)throw new Error('Docker postgres:17 error: '+String(r.error||r.stderr).slice(0,900));
  return r.stdout;
}
function tool(cmd,database,...args){
  return docker(['run','--rm','--network=host','--mount','type=bind,src='+dir+',dst=/backup',
    '-e','PGPASSWORD=synthetic_ci_only_password','postgres:17',cmd,
    '-h','127.0.0.1','-U','postgres','-d',database,...args]);
}
try{
  await admin.connect();open=true;
  const ver=(await admin.query('show server_version_num')).rows[0].server_version_num;
  assert.ok(Number(ver)>=170000&&Number(ver)<180000,'Postgres 17 required');
  await admin.query('create database "'+src+'"');
  await admin.query('create database "'+dst+'"');
  const source=new pg.Client({...cfg,database:src});await source.connect();
  try{
    await source.query([
      'create schema zukait_mechanical;',
      'create schema zukait_vehicle;',
      'create table public.staff_credentials(user_id text primary key);',
      'create table public.workshop_reception_commands(request_id uuid primary key);',
      'create table public.workshop_state(id text primary key,revision bigint not null,data jsonb not null);',
      'create table public.workshop_state_history(revision bigint primary key,data jsonb not null);',
      'create table zukait_mechanical.receipts(request_id uuid primary key,actor_id text not null references public.staff_credentials(user_id));',
      'create table zukait_vehicle.direct_job_customer_role_audit(request_id uuid primary key references public.workshop_reception_commands(request_id));',
      "insert into public.staff_credentials values ('synthetic-employee');",
      "insert into public.workshop_state values ('main',17163,'{\"jobs\":[{\"no\":\"SYNTHETIC-1\"}],\"sessions\":[{\"type\":\"ID001\"}]}');",
      "insert into public.workshop_state_history values (17162,'{\"jobs\":[],\"sessions\":[{\"type\":\"ID001\"}]}');"
    ].join('\n'));
    for(let i=0;i<6;i++){
      const id='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
      await source.query('insert into public.workshop_reception_commands values ($1)',[id]);
      await source.query('insert into zukait_vehicle.direct_job_customer_role_audit values ($1)',[id]);
      await source.query('insert into zukait_mechanical.receipts values ($1,$2)',[id,'synthetic-employee']);
    }
  }finally{await source.end()}
  tool('pg_dump',src,'--format=custom','--compress=1','--serializable-deferrable',
    '--no-owner','--no-acl','--schema=public','--schema=zukait_mechanical',
    '--schema=zukait_vehicle','--file=/backup/coherent.dump');
  assert.ok(statSync(archive).size>1000);
  const hash=createHash('sha256').update(readFileSync(archive)).digest('hex');
  assert.match(hash,/^[a-f0-9]{64}$/);
  const toc=tool('pg_restore',src,'--list','/backup/coherent.dump');
  for(const marker of ['TABLE DATA public workshop_state ','TABLE DATA public workshop_state_history ',
   'TABLE DATA zukait_vehicle direct_job_customer_role_audit ','TABLE DATA zukait_mechanical receipts ']){
    assert.ok(toc.includes(marker),'Missing table in archive: '+marker);
  }
  tool('pg_restore',dst,'--exit-on-error','--clean','--if-exists',
    '--no-owner','--no-acl','/backup/coherent.dump');
  const restored=new pg.Client({...cfg,database:dst});await restored.connect();
  try{
    const q=[
      'select (select count(*) from zukait_vehicle.direct_job_customer_role_audit) vehicle_rows,',
      '(select count(*) from zukait_mechanical.receipts) mechanical_rows,',
      '(select count(*) from public.workshop_reception_commands) command_rows,',
      "(select revision from public.workshop_state where id='main') current_revision,",
      '(select max(revision) from public.workshop_state_history) old_revision,',
      '(select count(*) from zukait_vehicle.direct_job_customer_role_audit a',
      ' where not exists(select 1 from public.workshop_reception_commands c where c.request_id=a.request_id)) missing_requests,',
      "(select count(*) from pg_constraint where conname='direct_job_customer_role_audit_request_id_fkey' and convalidated) validated_fk"
    ].join(' ');
    const x=(await restored.query(q)).rows[0];
    assert.deepEqual([x.vehicle_rows,x.mechanical_rows,x.command_rows,x.current_revision,
      x.old_revision,x.missing_requests,x.validated_fk].map(Number),[6,6,6,17163,17162,0,1]);
    await assert.rejects(restored.query(
      "insert into zukait_vehicle.direct_job_customer_role_audit values ('00000000-0000-4000-8000-000000000999')"),
      e=>e.code==='23503');
  }finally{await restored.end()}
  console.log('PASS one-transaction PostgreSQL17 backup/restore: synthetic Vehicle audit FK 6/6, Mechanical, history and ID001');
}finally{
  if(open){
    for(const db of [dst,src]){
      try{await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',[db])}catch{}
      try{await admin.query('drop database if exists "'+db+'"')}catch{}
    }
    await admin.end();
  }
  rmSync(dir,{recursive:true,force:true});
}
