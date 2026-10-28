import fs from 'node:fs';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {randomUUID} from 'node:crypto';
const db=new PGlite();
try{
 await db.exec(fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8').replace(/\r\n/g,'\n').replace('create extension if not exists pgcrypto;',''));
 for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/\r\n/g,'\n'));
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) values('M','Manager','Manager','','x','x'),('S','Supervisor','Supervisor','','x','x');insert into workshop_state(id,data,revision,updated_by) values('main','{\"jobs\":[{\"no\":\"LEGACY\",\"jobType\":\"Cash\",\"reg\":\"QA\"}],\"assign\":[],\"sessions\":[],\"estimates\":[]}',1,'M');insert into workshop_insurance_companies(name,active) values('QA Insurance',true);");
 await db.exec('set role service_role');
 const state=async()=>(await db.query("select data,revision from workshop_state where id='main'")).rows[0];
 const convert=async(no,actor='M',reason='Correct mistaken cash classification',company='QA Insurance')=>{const s=await state();const data=structuredClone(s.data);const j=data.jobs.find(j=>j.no===no);Object.assign(j,{jobType:'Insurance',insuranceCompany:company,claimNo:'QA-CLAIM'});return (await db.query('select zukait_manager_full_job_edit($1,$2,$3,$4,$5,$6) as result',[s.revision,JSON.stringify(data),actor,no,reason,'[]'])).rows[0].result;};
 await assert.rejects(convert('LEGACY','S'),/reception_manager_required/);
 await assert.rejects(convert('LEGACY','M',''),/reception_reason_required/);
 await assert.rejects(convert('LEGACY','M','Correction','Unknown Insurance'),/reception_insurance_required/);
 let before=await state(),bad=structuredClone(before.data);bad.jobs[0].jobType='Insurance';bad.jobs[0].insuranceCompany='QA Insurance';
 await assert.rejects(db.query('update workshop_state set data=$1 where id=\'main\'',[JSON.stringify(bad)]),/insurance_job_requires_approved_reception/);
 let r=await convert('LEGACY');assert.equal(r.ok,true);assert.equal(r.job.jobType,'Insurance');
 let audit=(await db.query('select * from workshop_job_classification_audit')).rows;assert.equal(audit.length,1);assert.equal(audit[0].before_data.jobType,'Cash');assert.equal(audit[0].after_data.jobType,'Insurance');assert.equal(audit[0].actor_id,'M');
 assert.equal((await db.query("select count(*)::int n from workshop_direct_job_approvals where job_card='LEGACY'")).rows[0].n,0,'Correction must not fabricate external approval');
 assert.equal((await db.query("select zukait_reception_job_approval_valid('LEGACY',null) as valid")).rows[0].valid,false);
 const s=await state();bad=structuredClone(s.data);bad.jobs.push({no:'NEW',jobType:'Insurance',insuranceCompany:'QA Insurance'});await assert.rejects(db.query('update workshop_state set data=$1 where id=\'main\'',[JSON.stringify(bad)]),/insurance_job_requires_approved_reception/);
 r=(await db.query('select zukait_manager_full_job_edit($1,$2,$3,$4,$5,$6) as result',[before.revision,JSON.stringify(before.data),'M','LEGACY','Stale request','[]'])).rows[0].result;assert.equal(r.code,'conflict');
 const call=async c=>(await db.query('select zukait_reception_command($1,$2::jsonb) result',['M',JSON.stringify(c)])).rows[0].result;
 const details={make:'Toyota',model:'Camry',year:'2020',registration:'QA-DIRECT',vin:'1HGCM82633A004352',odometer:'500',odometer_unit:'KM'};
 await call({operation:'CREATE_DIRECT_JOB',job_type:'CASH',job_card:'DIRECT',details,received_confirmed:true,reason:'QA direct',request_id:randomUUID()});
 r=await convert('DIRECT');assert.equal(r.ok,true);assert.equal(r.job.jobType,'Insurance');
 assert.equal((await db.query("select identity->>'jobType' kind from workshop_direct_job_identity where job_card='DIRECT'")).rows[0].kind,'Insurance');
 r=await convert('DIRECT','M','Correct claim again');assert.equal(r.ok,true,'Subsequent insurance edits still work');
 assert.equal((await db.query('select count(*)::int n from workshop_job_classification_audit')).rows[0].n,2,'Repeat save does not create duplicate conversion');
 let rc=(await call({operation:'CREATE',job_type:'CASH',insurance_id:null,details:{...details,registration:'QA-LINK'},request_id:randomUUID()})).record;
 const day=new Date().toISOString().slice(0,10);
 rc=(await call({operation:'SET_APPROVED',rc_no:rc.rc_no,expected_revision:rc.revision,request_id:randomUUID(),reason:'QA cash approval',date:day})).record;
 rc=(await call({operation:'CREATE_CHECKLIST_JOB',rc_no:rc.rc_no,expected_revision:rc.revision,request_id:randomUUID(),reason:'QA cash job',job_card:'LINKED'})).record;
 r=await convert('LINKED');assert.equal(r.ok,true);assert.equal(r.job.jobType.toUpperCase(),'INSURANCE');assert.equal((await db.query('select approval_status from workshop_receptions where rc_no=$1',[rc.rc_no])).rows[0].approval_status,'WAITING');
 assert.equal((await db.query('select job_type from workshop_receptions where rc_no=$1',[rc.rc_no])).rows[0].job_type,'INSURANCE');
 // JC11992 reproducer: delivered legacy cards have no saved type, not Cash.
 const originals=[{no:'UNTYPED',reg:'QA-OLD',delivered:true},{no:'NULLTYPE',reg:'QA-NULL',jobType:null},{no:'EMPTYTYPE',reg:'QA-EMPTY',jobType:''},{no:'SPACETYPE',reg:'QA-SPACE',jobType:'   '},{no:'BADTYPE',reg:'QA-BAD',jobType:'UNKNOWN'}];
 let legacy=await state();legacy.data.jobs.push(...originals);legacy.data.assign.push({id:'OLD-WORK',job:'UNTYPED',emp:'S',suggested:120,completed:true});legacy.data.sessions.push({id:'OLD-TIME',job:'UNTYPED',emp:'S',start:1000,end:2000});
 await db.query("update workshop_state set data=$1 where id='main'",[JSON.stringify(legacy.data)]);
 for(const old of originals.slice(0,4)){
  const saved=await state(),candidate=structuredClone(saved.data);Object.assign(candidate.jobs.find(j=>j.no===old.no),{jobType:'Insurance',insuranceCompany:'QA Insurance'});
  await assert.rejects(db.query("update workshop_state set data=$1 where id='main'",[JSON.stringify(candidate)]),/insurance_job_requires_approved_reception/,'ordinary save cannot classify a legacy job');
  await assert.rejects(convert(old.no,'S'),/reception_manager_required/);
  await assert.rejects(convert(old.no,'M',''),/reception_reason_required/);
  await assert.rejects(convert(old.no,'M','Correction','Unknown Insurance'),/reception_insurance_required/);
  const result=await convert(old.no,'M','Correct missing historical job type');assert.equal(result.ok,true);assert.equal(result.job.jobType,'Insurance');
  const record=(await db.query('select * from workshop_job_classification_audit where job_card=$1',[old.no])).rows[0];
  assert.deepEqual(record.before_data,old,'audit retains the actual missing/null/blank previous value');assert.equal(record.after_data.jobType,'Insurance');
  assert.equal((await db.query('select zukait_manager_classification_valid($1,$2,$3,$4) valid',[old.no,JSON.stringify(old),JSON.stringify(result.job),record.expected_revision])).rows[0].valid,false,'a past transaction audit cannot authorize another correction');
  assert.equal((await db.query('select zukait_reception_job_approval_valid($1,null) valid',[old.no])).rows[0].valid,false,'correction does not manufacture insurer approval');
  assert.equal((await convert(old.no)).ok,true,'repeat save works without a second conversion audit');
  assert.equal((await db.query('select count(*)::int n from workshop_job_classification_audit where job_card=$1',[old.no])).rows[0].n,1);
 }
 await assert.rejects(convert('BADTYPE'),/insurance_job_requires_approved_reception/,'arbitrary invalid classifications are not treated as unclassified');
 const preserved=await state();assert.deepEqual(preserved.data.assign,legacy.data.assign);assert.deepEqual(preserved.data.sessions,legacy.data.sessions);assert.equal(preserved.data.jobs.find(j=>j.no==='UNTYPED').delivered,true);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname in ('zukait_manager_full_job_edit','zukait_manager_classification_valid','zukait_linked_classification_valid') and has_function_privilege($1,p.oid,'execute')",[role])).rows[0].n,0,'public client roles cannot call the correction helpers');
 await assert.rejects(db.query("delete from workshop_job_classification_audit"),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.exec('delete from workshop_job_classification_audit'),/classification_audit_immutable/);
 await db.exec(fs.readFileSync('docs/job-classification/DISABLE_CORRECTION.sql','utf8'));assert.equal((await db.query('select count(*)::int n from workshop_job_classification_audit')).rows[0].n,7,'Disable preserves classification audit');assert.equal((await db.query("select approval_status from workshop_receptions where job_card='LINKED'")).rows[0].approval_status,'WAITING','Disable preserves corrected linked job');console.log('Rollback SQL executes and retains corrected linked job and all immutable audit records.');
 console.log('PASS: Manager Cash/Credit/unclassified-to-Insurance correction; immutable old/new audit; missing/null/blank legacy values; no fake insurer approval; permission/reason/insurer/conflict/transaction checks; ordinary-save and new-job bypass blocked; work and hours preserved; repeat save works.');
}finally{await db.close()}
