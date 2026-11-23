import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mechanicalTimeApi} from '../supabase/functions/workshop-api/extensions/mechanical_time_api.js';
import {mechanicalSectionPersistence} from './mechanical-section-persistence.mjs';
export async function mechanicalTimePersistence({db,snapshot}){
 const baseline=await snapshot();await db.exec('begin');
 try{
  const actor={id:'SUP003',role:'Mechanical Supervisor',active:true},hash='d'.repeat(64);
  await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt,must_change) values('SUP003','QA dedicated Supervisor','Mechanical Supervisor','QA_MECHANICAL','none','none',false)");
  await db.query('insert into staff_sessions(token_hash,user_id) values($1,$2)',[hash,actor.id]);
  await db.exec("update zukait_mechanical.settings set capabilities=capabilities||'{\"SUP003\":[\"TASK_ASSIGN\",\"MC_CREATE\"]}'::jsonb");
  await mechanicalSectionPersistence({db,snapshot,actor,hash});
  const admin={rpc:async(name,p)=>{await db.exec('savepoint mechanical_time_rpc');await db.exec('set role service_role');try{let result;
   if(name==='zukait_mechanical_read')result=await db.query('select public.zukait_mechanical_read($1,$2,$3,$4) r',[p.p_actor,p.p_session_hash,p.p_operation,p.p_kind]);
   else if(name==='zukait_mechanical_dashboard')result=await db.query('select public.zukait_mechanical_dashboard($1,$2,$3,$4::uuid) r',[p.p_actor,p.p_session_hash,p.p_after,p.p_checklist]);
   else throw Error('Unexpected RPC');return {data:result.rows[0].r};
  }catch(error){await db.exec('rollback to savepoint mechanical_time_rpc');return {error};}finally{await db.exec('reset role');await db.exec('release savepoint mechanical_time_rpc');}},from:table=>({select:()=>({eq:()=>({single:async()=>({data:await snapshot()})}),then:async resolve=>resolve({data:(await db.query('select user_id,display_name,role,department,active from staff_credentials')).rows})})})};
  let commits=0;
  const options={enabled:true,sessionHash:hash,verifySession:async()=>actor,commit:async(revision,data,actorId,assignmentId)=>{
   commits++;const live=(await db.query('select to_jsonb(l) r from workshop_live_status l')).rows.map(r=>r.r);
   await db.exec('set role service_role');try{return (await db.query('select public.zukait_mechanical_time_commit($1,$2,$3,$4,$5::jsonb,$6::jsonb) r',[actorId,hash,revision,assignmentId,JSON.stringify(data),JSON.stringify(live)])).rows[0].r;}finally{await db.exec('reset role');}
  }};
  const body={action:'mechanical_time_management',operation:'READ',jobCard:'QA_JC_0'};
  const read=await mechanicalTimeApi(admin,actor,body,options);assert.equal(read.status,200,JSON.stringify(read));assert.equal(commits,0);
  assert.equal(read.body.assign.length,1);const a=read.body.assign[0];
  const change={...body,operation:'CHANGE',command:{operation:'SET_ALLOCATION',requestId:'tm-'+randomUUID(),assignmentId:a.id,minutes:90,reason:'Synthetic audited Mechanical correction',expectedSource:a.allocationToken,expectedSessions:read.body.employeeTokens[a.emp]}};
  const result=await mechanicalTimeApi(admin,actor,change,options);assert.equal(result.status,200,JSON.stringify(result));assert.equal(commits,1);
  const after=await snapshot();assert.equal(after.data.assign.find(r=>r.id===a.id).suggested,90);assert.deepEqual(after.data.expenses,baseline.data.expenses);assert.deepEqual(after.data.sessions,baseline.data.sessions);
  assert.equal(after.data.additionalActions.at(-1).source,'Mechanical Time Management');assert.equal(after.data.additionalActions.at(-1).by,'SUP003');assert.equal(after.data.additionalActions.at(-1).reason,change.command.reason);
  assert.equal((await mechanicalTimeApi(admin,actor,change,options)).body.duplicate,true);assert.equal(commits,1);
  assert.equal((await db.query("select has_function_privilege('anon','public.zukait_mechanical_time_commit(text,text,bigint,text,jsonb,jsonb)','execute') or has_function_privilege('authenticated','public.zukait_mechanical_time_commit(text,text,bigint,text,jsonb,jsonb)','execute') allowed")).rows[0].allowed,false);
  const forged=structuredClone(after.data);forged.expenses.push({id:'forged-unrelated-expense',amount:999});
  await db.exec('savepoint mechanical_time_forgery');
  try{await assert.rejects(db.query('select public.zukait_mechanical_time_commit($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[actor.id,hash,after.revision,a.id,JSON.stringify(forged),'[]']),/mechanical_time_scope_conflict/);}finally{await db.exec('rollback to savepoint mechanical_time_forgery');await db.exec('release savepoint mechanical_time_forgery');}
  assert.deepEqual(await snapshot(),after,'Rejected financial change must not alter any workshop data');
  await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[hash]);assert.equal((await mechanicalTimeApi(admin,actor,body,options)).status,401);
 }finally{await db.exec('rollback');}
 assert.deepEqual(await snapshot(),baseline,'Disposable transaction must restore the complete fixture');
 console.log('PASS actual Mechanical time RPC/SQL: SUP003 session/capability, private read projection, CAS commit/audit/exact retry, no work/financial rewrite, revoked-session denial and complete isolated rollback.');
}
