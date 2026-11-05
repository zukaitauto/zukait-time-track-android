import fs from 'node:fs';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const source=fs.readFileSync('supabase/functions/workshop-api/job_edit_rules.js','utf8');
const {jobEditTransition:change,preserveJobEditAuthority:protect}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const d={jobs:[{no:'J',make:'Toyota',model:'Camry',reg:'123',jobType:'Cash',receptionLocation:'VIW',editRevision:1}],assign:[],sessions:[{id:'live',job:'J',start:123,end:null}]},manager={id:'M',role:'Manager'};
const command={jobCard:'J',operation:'FULL_EDIT',expectedJob:d.jobs[0],expectedEditRevision:1,expectedAssignments:[],allocations:[],patch:{receptionLocation:'VWC'},reason:'Customer collected vehicle pending parts'};
const r=change(d,manager,command,12345);assert.equal(r.ok,true);assert.equal(r.job.receptionLocation,'VWC');assert.deepEqual(r.data.sessions,d.sessions);assert.deepEqual(r.data.assign,d.assign);assert.equal(r.data.jobEdits[0].before.receptionLocation,'VIW');assert.equal(r.data.jobEdits[0].after.receptionLocation,'VWC');assert.equal(d.jobs[0].receptionLocation,'VIW');
for(const role of ['Employee','Supervisor','Receptionist'])assert.equal(change(d,{id:'X',role},command,1).ok,false);
for(const value of ['OTHER',true,null,''])assert.equal(change(d,manager,{...command,patch:{receptionLocation:value}},1).ok,false);
const stale=structuredClone(d);stale.jobs[0].editRevision++;assert.equal(change(stale,manager,command,1).code,'job_edit_conflict');
for(const role of ['Manager','Supervisor','Employee']){const forged=structuredClone(d);forged.jobs[0].receptionLocation='VWC';assert.equal(protect(forged,d,{id:'X',role}).jobs[0].receptionLocation,'VIW');}
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;
create table staff_credentials(user_id text,role text,active boolean);insert into staff_credentials values('M','Manager',true),('S','Supervisor',true);
create table workshop_state(id text,revision bigint,data jsonb);
create table workshop_direct_job_identity(job_card text);
create table workshop_receptions(rc_no text,job_card text,location text,closed_at timestamptz,released_date date,outcome text,repair_status text,updated_by text);
create table workshop_reception_movements(rc_no text,from_location text,to_location text,occurred_at timestamptz,actor_id text,reason text);
create table workshop_reception_audit(rc_no text,operation text,actor_id text,before_data jsonb,after_data jsonb,reason text);
create function projection() returns trigger language plpgsql as $$begin update workshop_state set revision=revision+1,data=jsonb_set(data,'{jobs}',(select jsonb_agg(j||jsonb_build_object('receptionLocation',new.location)) from jsonb_array_elements(data->'jobs') j));return new;end $$;
create trigger project after update on workshop_receptions for each row execute function projection();
create function zukait_manager_full_job_edit(bigint,jsonb,text,text,text,jsonb) returns jsonb language plpgsql as $$begin
 if $5='fail' then return '{"ok":false,"code":"conflict"}';end if;
 if (select revision from workshop_state where id='main')<>$1 then return '{"ok":false,"code":"conflict"}';end if;
 if ($6->0->>'state_revision')::bigint<>$1+1 then raise exception 'wrong live revision';end if;
 update workshop_state set data=$2,revision=revision+1 where id='main';return jsonb_build_object('ok',true,'job',$2->'jobs'->0);end $$;`);
await db.exec(fs.readFileSync('supabase/migrations/20261105135133_manager_job_vehicle_location.sql','utf8'));
const reset=async linked=>{await db.exec('truncate workshop_state,workshop_receptions,workshop_reception_movements,workshop_reception_audit');await db.query("insert into workshop_state values('main',1,$1::jsonb)",[JSON.stringify(d)]);if(linked)await db.exec("insert into workshop_receptions(rc_no,job_card,location,repair_status) values('RC','J','VIW','PENDING')");};
const call=async(reason='Reason',actor='M',expected=1,data=r.data)=>(await db.query('select zukait_manager_full_job_edit($1,$2::jsonb,$3,$4,$5,$6::jsonb) r',[expected,JSON.stringify(data),actor,'J',reason,JSON.stringify([{state_revision:2}])])).rows[0].r;
for(const linked of [false,true]){await reset(linked);assert.equal((await call()).ok,true);const row=(await db.query('select * from workshop_state')).rows[0];assert.equal(row.data.jobs[0].receptionLocation,'VWC');assert.deepEqual(row.data.sessions,d.sessions);assert.equal(Number(row.revision),linked?3:2);assert.equal(Number((await db.query('select count(*) n from workshop_reception_movements')).rows[0].n),linked?1:0);if(linked)assert.equal((await db.query('select location from workshop_receptions')).rows[0].location,'VWC');}
await reset(true);await assert.rejects(call('fail'),/full_edit_commit_failed/);assert.equal((await db.query('select location from workshop_receptions')).rows[0].location,'VIW');assert.equal(Number((await db.query('select count(*) n from workshop_reception_movements')).rows[0].n),0);
await reset(true);assert.equal((await call('Reason','M',0)).code,'conflict');assert.equal((await db.query('select location from workshop_receptions')).rows[0].location,'VIW');await assert.rejects(call('Reason','S'),/manager_required/);await assert.rejects(call(''),/reason_required/);
await reset(true);await db.exec("update workshop_receptions set repair_status='CTL'");await assert.rejects(call('Reason','M',2),/ctl_release_required/);
console.log('Job location: Manager-only audited direct/linked updates, shared VWC, state/live revisions, stale saves, rollback and CTL protection passed.');
}finally{await db.close()}
