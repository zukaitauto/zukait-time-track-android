import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
// In-memory PostgreSQL only: no URL, network or production state is accepted.
const db=new PGlite();
try{
 // PGlite includes gen_random_uuid in core, but has no pgcrypto extension.
 // No cryptographic staff-auth function is exercised by this SQL test.
 await db.exec(fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8').replace('create extension if not exists pgcrypto;',''));
 for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()){
  try{await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));}catch(e){console.error('Migration failed:',file,e.message,e.where||'');throw e;}
 }
 await db.exec(fs.readFileSync('supabase/V336_JOB_DESCRIPTION_PERSISTENCE.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/V336_JOB_DESCRIPTION_PERSISTENCE.sql','utf8')); // idempotent retry
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) values('QA-MGR','Manager','Manager','','none','none'),('QA-RC','Reception','Receptionist','','none','none'),('QA-EMP','Employee','Employee','','none','none');insert into workshop_state(id,data,revision,updated_by) values('main','{\"jobs\":[],\"assign\":[],\"sessions\":[],\"estimates\":[]}',1,'QA-MGR');");
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) values('QA-SUP','Supervisor','Supervisor','','none','none');");
 await db.exec('set role service_role');
 const call=async(c,actor='QA-RC')=>(await db.query('select zukait_reception_command($1,$2::jsonb) result',[actor,JSON.stringify(c)])).rows[0].result;
 const details={make:'Toyota',model:'Camry',year:'2023',registration:'QA-123',vin:'1HGCM82633A004352',odometer:'500',odometer_unit:'KM'};
 const direct={operation:'CREATE_DIRECT_JOB',job_type:'CASH',job_card:'QA100',details,received_confirmed:true,reason:'QA direct',request_id:randomUUID()};
 let result=await call(direct);assert.equal(result.job_card,'QA100');
 assert.equal((await db.query("select j->>'workDescription' description from workshop_state,jsonb_array_elements(data->'jobs') j where j->>'no'='QA100'")).rows[0].description,'QA direct');assert.equal(result.record,undefined);
 assert.equal(Number((await db.query('select count(*) n from workshop_receptions')).rows[0].n),0,'Direct jobs must not insert checklists');
 assert.equal((await call(direct)).duplicate,true);
 await assert.rejects(call({...direct,reason:'changed'}),/reception_request_conflict/);
 await assert.rejects(call({...direct,request_id:randomUUID()},'QA-EMP'),/reception_job_forbidden/);
 const intake={operation:'CREATE',job_type:'CASH',insurance_id:null,details,request_id:randomUUID()};
 let rc=(await call(intake)).record;
 const command=(operation,extra={})=>({operation,rc_no:rc.rc_no,expected_revision:rc.revision,request_id:randomUUID(),reason:'QA status notes',...extra});
 rc=(await call(command('SET_CTL'))).record;assert.equal(rc.repair_status,'CTL');assert.equal(rc.approval_status,'WAITING');assert.equal(rc.outcome,null);
 await assert.rejects(call(command('SET_NOT_REPAIRED')),/reception_repair_closed/);
 const day=(await db.query("select (now() at time zone 'Asia/Muscat')::date::text as release_day")).rows[0].release_day;
 const release=command('RELEASE_CTL',{date:day});rc=(await call(release)).record;assert.equal(rc.released_date,day);assert.equal(rc.location,'VWC');
 assert.equal((await call(release)).duplicate,true);
 assert.equal(Number((await db.query('select count(*) n from workshop_reception_movements where rc_no=$1',[rc.rc_no])).rows[0].n),2);
 rc=(await call({...intake,request_id:randomUUID()})).record;
 const approved=command('SET_APPROVED',{date:day});rc=(await call(approved)).record;assert.equal(rc.approval_status,'APPROVED');
 const linked=command('CREATE_CHECKLIST_JOB',{job_card:'QA200'});rc=(await call(linked)).record;assert.equal(rc.job_card,'QA200');assert.equal((await call(linked)).duplicate,true);
 assert.equal((await db.query("select j->>'vin' vin from workshop_state,jsonb_array_elements(data->'jobs') j where id='main' and j->>'no'='QA200'")).rows[0].vin,details.vin);
 rc=(await call({...intake,request_id:randomUUID()})).record;
 const estimateCall=async command=>(await db.query('select zukait_reception_estimate_command($1,$2::jsonb) result',['QA-RC',JSON.stringify(command)])).rows[0].result;
 const client=randomUUID(),allocate={operation:'ALLOCATE',rc_no:rc.rc_no,client_key:client,request_id:randomUUID()};
 const allocation=(await estimateCall(allocate)).estimate;assert.equal((await estimateCall(allocate)).duplicate,true);
 const draft={id:client,estimateNo:allocation.estimate_no,receptionNo:rc.rc_no,type:'LS',vatEnabled:true,date:day,lsRows:[{id:randomUUID(),description:'Repair',amount:10}],labourRows:[],partRows:[],misc:0,lsSpareParts:0,customerName:'forged customer',vin:'forged'};
 const save={operation:'SAVE',rc_no:rc.rc_no,client_key:client,request_id:randomUUID(),expected_revision:0,estimate:draft};
 const saved=(await estimateCall(save)).estimate;assert.equal(saved.vin,details.vin);assert.equal(saved.customerName,'');assert.equal(saved.revision,1);assert.equal((await estimateCall(save)).duplicate,true);
 await assert.rejects(estimateCall({...save,request_id:randomUUID()}),/reception_stale_revision/);
 assert.equal((await estimateCall({operation:'GET',rc_no:rc.rc_no})).estimates.length,1);
 await assert.rejects(db.query('select zukait_reception_estimate_command($1,$2::jsonb)',['QA-EMP',JSON.stringify(allocate)]),/reception_forbidden/);
 await db.exec('reset role');
 for(const group of [['reception-direct-job.sql','reception-cash-amount.sql'],['reception-create-job.sql','reception-vehicle-authority.sql'],['reception-create-job.sql','reception-additional.sql'],['reception-cancellation-fixture.sql','reception-cancellation.sql']]){
  await db.exec('reset role');
  await db.exec('begin');try{for(const file of group){try{await db.exec(fs.readFileSync('tests/'+file,'utf8'));}catch(e){console.error('Regression SQL:',file,e.message,e.where||'');throw e;}}}finally{await db.exec('rollback');}
 }
 await db.exec('reset role');
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from workshop_direct_job_approvals'),/permission denied/);
  await assert.rejects(db.query("select zukait_reception_command('QA-MGR','{\"operation\":\"CAPABILITIES\"}')"),/permission denied/);
  await db.exec('reset role');
 }
 console.log('PASS: actual PostgreSQL migration execution, direct separation, receipts, roles, CTL release, history and RLS grants');
}catch(e){console.error('SQL verification failed:',e.message,e.where||'');process.exitCode=1;}finally{await db.close();}
