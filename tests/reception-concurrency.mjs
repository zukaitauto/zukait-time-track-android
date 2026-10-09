import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

// Never accept a Supabase URL or a user-selected database for this destructive fixture.
assert.equal(process.env.ZUKAIT_RECEPTION_ISOLATED, '1', 'Explicit isolated-test opt-in required');
const host=process.env.PGHOST || '127.0.0.1';
assert.ok(['127.0.0.1','localhost','::1'].includes(host), 'Database must be on loopback');
const config={host,port:Number(process.env.PGPORT || 5432),user:'postgres',password:process.env.PGPASSWORD || 'reception-test-only',connectionTimeoutMillis:10000};
const database='zukait_reception_qa_'+randomUUID().replaceAll('-','');
const admin=new pg.Client({...config,database:'postgres'});
let control,a,b;
const command=(client,c,actor='QA-MGR')=>client.query('select public.zukait_reception_command($1,$2::jsonb) as result',[actor,JSON.stringify(c)]).then(r=>r.rows[0].result);
const makeCommand=(operation,f,extra={})=>({operation,rc_no:f.rc,expected_revision:f.revision,request_id:randomUUID(),...extra});
let sequence=-100000;
const readState=()=>control.query("select data from workshop_state where id='main'").then(r=>r.rows[0].data);
const readRecord=rc=>control.query('select * from workshop_receptions where rc_no=$1',[rc]).then(r=>r.rows[0]);
const get=rc=>command(control,{operation:'GET',rc_no:rc});
const date=()=>control.query("select (now() at time zone 'Asia/Muscat')::date::text as day").then(r=>r.rows[0].day);
async function fixture(linked=false){
 const f={rc:'RC-QA-'+randomUUID(),job:'JCQA'+randomUUID().replaceAll('-','').toUpperCase(),revision:1,insurance:1,part:randomUUID(),estimate:randomUUID(),quotation:randomUUID()};
 const details={make:'Toyota',model:'Camry',registration:'',year:'2015'};
 const part={id:f.part,name:'Front bumper',part_no:'B1',qty:2};
 const quote={id:f.estimate,estimateNo:'Zi-QA-'+randomUUID(),makeModel:'Toyota Camry',registration:'',year:'2015',jobCard:''};
 await control.query('begin');
 try{
  await control.query("insert into workshop_receptions(rc_no,sequence_no,insurance_id,details,location,approval_status,created_by,updated_by) values($1,$2,1,$3,'VWC','APPROVED','QA-MGR','QA-MGR')",[f.rc,sequence--,details]);
  await control.query("insert into workshop_reception_preliminary_parts(rc_no,items,updated_by) values($1,$2,'QA-MGR')",[f.rc,JSON.stringify([part])]);
  await control.query("insert into workshop_reception_estimates(id,rc_no,estimate_id,estimate_no,snapshot,identity_snapshot,linked_by) values($1,$2,$3,$4,$5,zukait_reception_identity($6,1),'QA-MGR')",[f.quotation,f.rc,f.estimate,quote.estimateNo,quote,details]);
  await control.query("insert into workshop_reception_approvals(rc_no,quotation_id,reference,approval_date,approved_amount,approved_parts,parts_snapshot,estimate_snapshot,identity_snapshot,actor_id,reason) values($1,$2,'QA',current_date,10,$3,$3,$4,zukait_reception_identity($5,1),'QA-MGR','Isolated fixture')",[f.rc,f.quotation,JSON.stringify([part]),quote,details]);
  await control.query("update workshop_state set data=jsonb_set(data,'{estimates}',data->'estimates'||jsonb_build_array($1::jsonb)) where id='main'",[quote]);
  await control.query("insert into workshop_v2_spare_part_list_numbers(list_no,sequence_no,job_card,client_key,created_by) values($1,$2,$3,$4,'QA-MGR')",['PL-QA-'+randomUUID(),sequence--,f.job,randomUUID()]);
  await control.query('commit');
 }catch(e){await control.query('rollback');throw e;}
 if(linked){const r=await command(control,makeCommand('CREATE_JOB',f,{job_card:f.job,reason:'Approved repair'}));f.revision=Number(r.record.revision);}
 return f;
}
async function waitForBlock(waiter,blocker){
 const until=Date.now()+7000;
 while(Date.now()<until){
  const r=await control.query('select $2::int = any(pg_blocking_pids($1::int)) as blocked',[waiter,blocker]);
  if(r.rows[0].blocked)return;
  await new Promise(resolve=>setTimeout(resolve,20));
 }
 throw Error('Competing transaction did not block on the expected connection');
}
async function race(name,first,second,expectedError){
 await a.query('begin');await a.query('set local role service_role');
 await b.query('begin');await b.query('set local role service_role');
 try{
  const firstResult=await first(a);
  const pending=second(b).then(result=>({result}),error=>({error}));
  await waitForBlock(b.processID,a.processID);
  await a.query('commit');
  const outcome=await pending;
  if(expectedError){assert.equal(outcome.error?.message,expectedError,name);await b.query('rollback');}
  else{if(outcome.error)throw outcome.error;await b.query('commit');}
  console.log('PASS real PostgreSQL overlap: '+name);
  return {first:firstResult,second:outcome.result};
 }finally{await a.query('rollback');await b.query('rollback');}
}
async function cancelCommand(f){
 const g=await get(f.rc);
 return makeCommand('CANCEL_JOB',{...f,revision:g.record.revision},{job_card:f.job,cancellation_date:await date(),reason:'Customer withdrew repair',review_fingerprint:g.cancellation.review.fingerprint,review_acknowledged:true});
}
try{
 await admin.connect();
 const version=await admin.query('show server_version_num');assert.ok(Number(version.rows[0].server_version_num)>=170000&&Number(version.rows[0].server_version_num)<180000,'PostgreSQL 17 required');
 await admin.query(`create database "${database}"`);
 control=new pg.Client({...config,database});a=new pg.Client({...config,database});b=new pg.Client({...config,database});
 await Promise.all([control.connect(),a.connect(),b.connect()]);
 await control.query(fs.readFileSync('tests/fixtures/reception-postgres17-baseline.sql','utf8'));
 for(const file of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort())await control.query(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await control.query("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt) values('QA-MGR','QA Manager','Manager','','not-a-credential','not-a-salt'),('QA-SUP','QA Supervisor','Supervisor','','not-a-credential','not-a-salt'),('QA-EMP','QA Employee','Employee','DENTING','not-a-credential','not-a-salt')");
 const initial={users:[{id:'QA-EMP',name:'QA Employee',role:'Employee',department:'DENTING'}],jobs:[{no:'QA-LEGACY',vehicle:'Legacy test vehicle',jobType:'CASH',status:'Open'}],assign:[{id:'QA-LEGACY-A',emp:'QA-EMP',job:'QA-LEGACY',completed:false}],sessions:[{id:'QA-LEGACY-S',assignmentId:'QA-LEGACY-A',emp:'QA-EMP',job:'QA-LEGACY',start:Date.now()-60000,end:0}],estimates:[],expenses:[{id:'QA-EXPENSE',job:'QA-LEGACY',amount:12.345}],consumables:[{id:'QA-MATERIAL',job:'QA-LEGACY',amount:3.21}]};
 await control.query("insert into workshop_state(id,data,revision,updated_by) values('main',$1,1,'QA-MGR')",[initial]);
 // Existing integration tests also run here against the schema fixture, without production access.
 for(const group of [['reception-create-job.sql','reception-vehicle-authority.sql'],['reception-create-job.sql','reception-additional.sql'],['reception-cancellation-fixture.sql','reception-cancellation.sql']]){
  await control.query('begin');
  try{for(const file of [...group,'reception-trigger-privileges.sql'])await control.query(fs.readFileSync('tests/'+file,'utf8'));}
  finally{await control.query('rollback');}
 }
 const sequences=await control.query('select (select last_value from workshop_reception_no_seq) rc,(select last_value from workshop_v2_estimate_no_seq) estimate,(select last_value from workshop_v2_spare_part_list_no_seq) pl');
 const live=await control.query("select to_jsonb(l)-'updated_at'-'updated_by'-'state_revision' as value from workshop_live_status l order by employee_id");
 // Identical lost-response retry must wait for the uncommitted command, then return its result.
 const one=await fixture();const create=makeCommand('CREATE_JOB',one,{job_card:one.job,reason:'Approved repair'});
 const duplicate=await race('same creation UUID commits once',c=>command(c,create),c=>command(c,create));
 assert.equal(duplicate.second.duplicate,true);
 assert.equal((await control.query('select count(*)::int n from workshop_reception_part_transfers where rc_no=$1',[one.rc])).rows[0].n,1);
 // Different request IDs with the same RC revision cannot create two jobs.
 const two=await fixture();const create2=makeCommand('CREATE_JOB',two,{job_card:two.job,reason:'Approved repair'});
 await race('competing creation loses stale revision',c=>command(c,create2),c=>command(c,{...create2,request_id:randomUUID(),job_card:two.job+'B'}),'reception_stale_revision');
 assert.equal((await readRecord(two.rc)).job_card,two.job);
 // An old full-state save cannot revert authoritative identity or copy observations to the job.
 const three=await fixture(true);const stale=await readState();const before=await readRecord(three.rc);
 const edit=makeCommand('EDIT',three,{insurance_id:1,details:{...before.details,make:'Nissan',model:'Altima',registration:'QA-NEW',damage:'Checklist only'},reason:'Correct identity'});
 await race('correction survives blocked stale full-state save',c=>command(c,edit),c=>c.query("update workshop_state set data=$1 where id='main'",[stale]));
 const corrected=(await readState()).jobs.find(j=>j.no===three.job);assert.equal(corrected.reg,'QA-NEW');assert.equal(corrected.vehicle,'Nissan Altima');assert.equal(corrected.damage,undefined);
 assert.equal((await control.query('select registration from workshop_v2_jobcards where job_card=$1',[three.job])).rows[0].registration,'QA-NEW');
 const four=await fixture(true);const fourRecord=await readRecord(four.rc);
 await race('movement invalidates simultaneous stale correction',c=>command(c,makeCommand('MOVE',four,{location:'VIW',reason:'Vehicle physically returned'})),c=>command(c,makeCommand('EDIT',four,{insurance_id:1,details:{...fourRecord.details,registration:'STALE'},reason:'Old device correction'})),'reception_stale_revision');
 assert.equal((await readRecord(four.rc)).location,'VIW');
 // New financial events invalidate cancellation review even without an operational part change.
 const five=await fixture(true);const cancellation5=await cancelCommand(five);const part5=(await control.query('select part_id from workshop_v2_spare_part_state where job_card=$1',[five.job])).rows[0].part_id;
 await race('parts event invalidates waiting cancellation review',c=>c.query('select zukait_v2_commit_event($1,$2,$3,$4,$5,null,$6,$7)',[randomUUID(),part5,'QA-MGR','qa-device','SPARE_PART_COMMERCIAL_UPDATED',999,{jobCard:five.job,partId:part5,note:'Reviewed on second device'}]),c=>command(c,cancellation5),'reception_cancellation_review_changed');
 assert.equal((await control.query('select count(*)::int n from workshop_reception_job_cancellations where rc_no=$1',[five.rc])).rows[0].n,0);
 const six=await fixture(true);const cancellation6=await cancelCommand(six);
 await race('new active work blocks waiting cancellation',c=>c.query("insert into workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,status) values($1,$2,$3,'QA-EMP','WORK',now(),'ACTIVE')",['QA-S-'+randomUUID(),'QA-A-'+randomUUID(),six.job]),c=>command(c,cancellation6),'reception_cancellation_active_work');
 const seven=await fixture(true);const cancellation7=await cancelCommand(seven);
 await race('committed cancellation blocks waiting work start',c=>command(c,cancellation7),c=>c.query("insert into workshop_v2_work_sessions(session_id,assignment_id,job_card,employee_id,kind,started_at,status) values($1,$2,$3,'QA-EMP','WORK',now(),'ACTIVE')",['QA-S-'+randomUUID(),'QA-A-'+randomUUID(),seven.job]),'reception_cancelled_work_history_protected');
 const eight=await fixture(true);const cancellation8=await cancelCommand(eight);
 const retry=await race('same cancellation UUID commits once',c=>command(c,cancellation8),c=>command(c,cancellation8));assert.equal(retry.second.duplicate,true);
 assert.equal((await control.query('select count(*)::int n from workshop_reception_job_cancellations where rc_no=$1',[eight.rc])).rows[0].n,1);
 const cancelledJob=(await readState()).jobs.find(j=>j.no===eight.job);assert.equal(cancelledJob.cancelled,true);assert.notEqual(cancelledJob.delivered,true);assert.equal(cancelledJob.receptionLocation,'VWC');
 // Simultaneous additional approval retries must transfer only the approved quantity once.
 const nine=await fixture(true),round=randomUUID(),additionalPart=randomUUID(),estimateId=randomUUID();
 const items=[{id:additionalPart,name:'Additional lamp',part_no:'QA-LAMP',qty:3}];
 const draft=await command(control,makeCommand('SAVE_ADDITIONAL_REQUEST',nine,{round_id:round,items,reason:'Additional damage'}));nine.revision=Number(draft.record.revision);
 const quote={id:estimateId,estimateNo:'Zi-QA-ADD-'+randomUUID(),makeModel:'Toyota Camry',registration:'',year:'2015',jobCard:nine.job,receptionNo:nine.rc,receptionAdditionalRequestId:round,total:15.555};
 await control.query("insert into workshop_v2_estimate_numbers(estimate_no,sequence_no,client_key,created_by) values($1,$2,$3,'QA-MGR')",[quote.estimateNo,sequence--,estimateId]);
 await control.query("update workshop_state set data=jsonb_set(data,'{estimates}',data->'estimates'||jsonb_build_array($1::jsonb)) where id='main'",[quote]);
 const link=await command(control,makeCommand('LINK_ADDITIONAL_ESTIMATE',nine,{round_id:round,estimate_no:quote.estimateNo,reason:'Review additional quotation'}));nine.revision=Number(link.record.revision);
 const additional=makeCommand('APPROVE_ADDITIONAL',nine,{round_id:round,quotation_id:link.quotation.id,reference:'QA-ADD',approval_date:await date(),approved_amount:'15.555',approved_parts:[{id:additionalPart,qty:1}],reason:'Surveyor approval'});
 const additionalRetry=await race('same additional approval UUID transfers once',c=>command(c,additional),c=>command(c,additional));assert.equal(additionalRetry.second.duplicate,true);
 assert.equal((await control.query('select count(*)::int n from workshop_reception_additional_transfers where approval_id=$1',[additionalRetry.first.approval.id])).rows[0].n,1);
 assert.equal((await control.query("select ordered_qty::text qty from workshop_v2_spare_part_state where job_card=$1 and part_no='QA-LAMP'",[nine.job])).rows[0].qty,'1');
 assert.equal((await readRecord(nine.rc)).location,'VWC');
 const final=await readState();for(const key of ['users','assign','sessions','expenses','consumables'])assert.deepEqual(final[key],initial[key],key+' changed');
 assert.deepEqual((await control.query("select to_jsonb(l)-'updated_at'-'updated_by'-'state_revision' as value from workshop_live_status l order by employee_id")).rows,live.rows,'live statuses changed');
 assert.deepEqual((await control.query('select (select last_value from workshop_reception_no_seq) rc,(select last_value from workshop_v2_estimate_no_seq) estimate,(select last_value from workshop_v2_spare_part_list_no_seq) pl')).rows,sequences.rows,'business sequence consumed');
 console.log('PASS: unrelated work, expenses, consumables, employee live status and business sequences preserved');
}finally{
 await Promise.allSettled([a?.end(),b?.end(),control?.end()]);
 // The name is generated in this process; no configurable database is ever dropped.
 try{await admin.query(`drop database if exists "${database}"`);}finally{await admin.end();}
}
