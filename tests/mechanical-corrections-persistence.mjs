import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {mechanicalRoute} from '../supabase/functions/workshop-api/extensions/mechanical_route.js';
import {jobEditTransition} from '../supabase/functions/workshop-api/job_edit_rules.js';
import {jobNumberCodec} from '../supabase/functions/workshop-api/job_number_rules.js';
export async function mechanicalCorrectionsPersistence({db,records,snapshot,native,pg,config,database}){
 const actor={id:'SUP003',role:'Mechanical Supervisor',active:true},hash='c'.repeat(64),entity=(await records()).checklists[0].id;let correctionCalls=0,lastCorrectionArgs;
 const rpc=async(name,p)=>{await db.exec('set role service_role');try{
  let sql,values;
  if(name==='zukait_mechanical_document_read'){sql='select public.zukait_mechanical_document_read($1,$2,$3,$4::uuid,$5,$6) r';values=[p.p_actor,p.p_session_hash,p.p_kind,p.p_entity,p.p_expected_records,p.p_expected_workshop]}
  else if(name==='zukait_mechanical_signature_read'){sql='select public.zukait_mechanical_signature_read($1,$2,$3,$4::uuid,$5::uuid,$6,$7,$8) r';values=[p.p_actor,p.p_session_hash,p.p_kind,p.p_request,p.p_entity,p.p_records,p.p_workshop,p.p_source_hash]}
  else if(name==='zukait_mechanical_signature_commit'){sql='select public.zukait_mechanical_signature_commit($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10::jsonb) r';values=[p.p_actor,p.p_session_hash,p.p_request,p.p_entity,p.p_records,p.p_workshop,p.p_device,p.p_source_hash,p.p_fingerprint,JSON.stringify(p.p_strokes)]}
  else if(name==='zukait_mechanical_signature_correction_read'){sql='select public.zukait_mechanical_signature_correction_read($1,$2,$3::uuid) r';values=[p.p_actor,p.p_session_hash,p.p_request]}
  else{assert.equal(name,'zukait_mechanical_signature_correct');correctionCalls++;lastCorrectionArgs=p;sql='select public.zukait_mechanical_signature_correct($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10::uuid,$11) r';values=[p.p_actor,p.p_session_hash,p.p_request,p.p_entity,p.p_records,p.p_workshop,p.p_device,p.p_source_hash,p.p_fingerprint,p.p_signature,p.p_reason]}
  return {data:(await db.query(sql,values)).rows[0].r};
 }catch(error){return {error}}finally{await db.exec('reset role')}};
 const route=(body,who=actor)=>mechanicalRoute({rpc},who,body,{enabled:true,documentsEnabled:true,signaturesEnabled:true,sessionHash:hash,verifySession:async()=>who});
 const input={checklistId:entity,expectedRevision:(await records()).revision,expectedWorkshopRevision:(await snapshot()).revision};
 const doc=await route({action:'mechanical_document',...input});assert.equal(doc.status,200,JSON.stringify(doc));
 const ink=[[[100,200],[600,900],[1000,500]]],capture={...input,requestId:randomUUID(),deviceId:'QA_CORRECTION',expectedSourceHash:doc.body.sourceHash,consent:true,strokes:ink};
 assert.equal((await route({action:'mechanical_signature_command',command:capture})).status,200);
 const before=JSON.stringify(await snapshot()),signaturesBefore=(await db.query('select * from zukait_mechanical.signatures order by request_id')).rows;
 const history=(await db.query('select count(*) n from workshop_state_history')).rows[0].n;
 const command={...input,requestId:randomUUID(),deviceId:'QA_CORRECTION',signatureId:capture.requestId,expectedSourceHash:doc.body.sourceHash,reason:'Synthetic wrongly drawn signature'},send=c=>route({action:'mechanical_signature_correction',command:c});
 for(const extra of [{reason:''},{signatureId:'invalid'},{actorId:'SUP001'},{strokes:ink}])assert.equal((await send({...command,...extra})).status,400);
 for(const who of [{id:'SUP001',role:'Supervisor',active:true},{id:'MGR',role:'Manager',active:true}])assert.equal((await route({action:'mechanical_signature_correction',command},who)).status,403);
 await db.exec("create function qa_fail_signature_correction() returns trigger language plpgsql as $$begin raise exception 'QA_CORRECTION_FAIL';end$$;create trigger qa_fail before insert on zukait_mechanical.signature_corrections for each row execute function qa_fail_signature_correction()");
 const failed=await send(command);assert.equal(failed.status,503,JSON.stringify({failed,correctionCalls,lastCorrectionArgs,command}));assert.equal((await records()).revision,input.expectedRevision);await db.exec('drop trigger qa_fail on zukait_mechanical.signature_corrections');
 if(native){
  const p=lastCorrectionArgs,sql='select public.zukait_mechanical_signature_correct($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10::uuid,$11) r',values=[p.p_actor,p.p_session_hash,p.p_request,p.p_entity,p.p_records,p.p_workshop,p.p_device,p.p_source_hash,p.p_fingerprint,p.p_signature,p.p_reason];
  const one=new pg.Client({...config,database}),two=new pg.Client({...config,database});await Promise.all([one.connect(),two.connect()]);
  try{await Promise.all([one.query('set role service_role'),two.query('set role service_role')]);await one.query('begin');await one.query(sql,values);const pending=two.query(sql,values);let blocked=false;
   for(let i=0;i<100;i++){if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[two.processID,one.processID])).rows[0].blocked){blocked=true;break}await new Promise(r=>setTimeout(r,20))}
   assert.ok(blocked,'Concurrent exact correction waits on tested control lock');await one.query('commit');assert.equal((await pending).rows[0].r.requestId,command.requestId);
  }finally{await one.query('rollback');await Promise.all([one.end(),two.end()])}
 }
 const corrected=await send(command);assert.equal(corrected.status,200,JSON.stringify(corrected));assert.equal(corrected.body.result.requiresRedraw,true);assert.equal((await records()).revision,input.expectedRevision+1);
 assert.equal((await send(command)).body.duplicate,true);assert.equal((await send({...command,reason:'Changed reason'})).body.code,'mechanical_signature_request_reused');
 assert.equal((await db.query('select count(*)::int n from zukait_mechanical.signature_corrections')).rows[0].n,1);
 assert.equal(JSON.stringify(await snapshot()),before);assert.equal((await db.query('select count(*) n from workshop_state_history')).rows[0].n,history);
 assert.deepEqual((await db.query('select * from zukait_mechanical.signatures order by request_id')).rows,signaturesBefore,'Original signature ink and identity remain immutable');
 const fresh={...input,expectedRevision:input.expectedRevision+1};const status=await route({action:'mechanical_signature_status',...fresh});assert.equal(status.body.signature,null);
 assert.equal((await route({action:'mechanical_signed_document_verify',...input})).body.code,'mechanical_document_changed','Old signed export is invalidated');
 const freshDoc=await route({action:'mechanical_document',...fresh});const replacement={...capture,...fresh,requestId:randomUUID(),expectedSourceHash:freshDoc.body.sourceHash};
 assert.equal((await route({action:'mechanical_signature_command',command:replacement})).status,200);
 const signed=await route({action:'mechanical_signed_document',...fresh});assert.equal(signed.body.signature.requestId,replacement.requestId);
 for(const action of ['update zukait_mechanical.signature_corrections set reason=reason','delete from zukait_mechanical.signature_corrections','truncate zukait_mechanical.signature_corrections'])await assert.rejects(db.exec(action),/mechanical_append_only/);
 for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.zukait_mechanical_signature_correct(text,text,uuid,uuid,bigint,bigint,text,text,text,uuid,text)','execute') ok",[role])).rows[0].ok,false);
 await db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[hash]);assert.equal((await send(command)).status,401);await db.query('update staff_sessions set revoked_at=null where token_hash=$1',[hash]);

 // Existing audited Manager number corrections change public aliases, never
 // stored JC keys, Mechanical links or time ownership.
 await db.exec("insert into staff_credentials(user_id,display_name,role,department,password_hash,password_salt,must_change) values('QA_NUMBER_MGR','QA Number Manager','Manager','Support','none','none',false)");
 const current=await snapshot(),jc=(await records()).checklists.find(c=>c.id===entity).manualJobCard.number,job=current.data.jobs.find(j=>j.no===jc),allocations=current.data.assign.filter(a=>a.job===jc&&!a.cancelled),request={operation:'FULL_EDIT',jobCard:jc,expectedJob:structuredClone(job),expectedEditRevision:Number(job.editRevision||0),expectedAssignments:allocations.map(a=>({id:a.id,suggested:a.suggested})),allocations:allocations.map(a=>({id:a.id,minutes:a.suggested})),patch:{notes:'Synthetic audited JC number correction'},reason:'Owner requested incorrect public number correction'};
 const edit=jobEditTransition(current.data,{id:'QA_NUMBER_MGR',name:'QA Number Manager',role:'Manager'},request,Date.now());assert.equal(edit.ok,true,JSON.stringify(edit));
 const links=(await db.query('select * from zukait_mechanical.links order by assignment_id')).rows,checklists=(await db.query('select * from zukait_mechanical.checklists order by id')).rows,live=(await db.query('select * from workshop_live_status')).rows;
 await db.exec('set role service_role');let renamed;try{renamed=(await db.query('select public.zukait_manager_numbered_job_edit($1,$2::jsonb,$3,$4,$5,$6::jsonb,$7,$8,true) r',[current.revision,JSON.stringify(edit.data),'QA_NUMBER_MGR',jc,request.reason,JSON.stringify(live),'975001',jc])).rows[0].r}finally{await db.exec('reset role')}
 assert.equal(renamed.ok,true);const after=await snapshot();assert.deepEqual(after.data.assign,current.data.assign);assert.deepEqual(after.data.sessions,current.data.sessions);
 assert.deepEqual((await db.query('select * from zukait_mechanical.links order by assignment_id')).rows,links);assert.deepEqual((await db.query('select * from zukait_mechanical.checklists order by id')).rows,checklists);
 const codec=jobNumberCodec(renamed.number_rows);assert.equal(codec.toPublic({jobCard:jc}).jobCard,'975001');assert.equal(codec.toInternal({manualJobCard:{number:'975001'}}).manualJobCard.number,jc);
 assert.equal((await db.query('select count(*)::int n from workshop_job_number_audit where stable_job=$1 and to_number=$2',[jc,'975001'])).rows[0].n,1);
 assert.equal(after.data.jobs.find(j=>j.no===jc).no,jc,'Stable identity remains fixed');
 console.log('PASS Mechanical corrections actual route/SQL: own-signature reason/audit, immutable ink, revision invalidation and redraw, retry/changed request/rollback/private ACL/revoked session; audited Manager public-number correction preserves every assignment/session/link/checklist identity.');
}
