import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import fs from 'node:fs';import {JSDOM} from 'jsdom';
export async function mechanicalSectionPersistence({db,snapshot,actor,hash}){
 const baseline=await snapshot();await db.exec('savepoint mechanical_sections');let serial=0;
 const call=async(command,raw=false)=>{const point='section_call_'+(++serial);await db.exec('savepoint '+point);await db.exec('set role service_role');try{
  return (await db.query(raw?'select public.zukait_reception_command($1,$2::jsonb) r':'select public.zukait_mechanical_section($1,$2,$3::jsonb) r',raw?[actor.id,JSON.stringify(command)]:[actor.id,hash,JSON.stringify(command)])).rows[0].r;
 }catch(e){await db.exec('rollback to savepoint '+point);throw e;}finally{await db.exec('reset role');await db.exec('release savepoint '+point);}};
 try{
  const read=await call({operation:'READ'});assert.equal(read.ok,true);assert.deepEqual(read.jobs.map(j=>j.no),['QA_JC_0','QA_JC_1']);assert.equal(read.jobs.some(j=>j.no==='QA_JC_11'),false);
  const clientKey=randomUUID(),allocate={operation:'ALLOCATE_ESTIMATE',request_id:randomUUID(),client_key:clientKey};
  const numbered=await call(allocate);assert.match(numbered.estimate.estimate_no,/^Zi-Qt\d+$/);assert.equal((await call(allocate)).duplicate,true);
  let quote,save,saved;const dom=new JSDOM('<div id="modal"></div>',{url:'https://qa.invalid',runScripts:'outside-only'}),w=dom.window;
  w.me=actor;w.state={jobs:[],estimates:[],estimateAudit:[]};w.alert=()=>{};w.openModal=html=>w.document.getElementById('modal').innerHTML=html;w.closeModal=()=>{};w.save=()=>{};w.setTimeout=()=>1;w.requestAnimationFrame=fn=>fn();w.MutationObserver=class{observe(){}disconnect(){}};
  w.zukaitCloud={syncNow:async()=>{},allocateEstimateNo:async()=>numbered.estimate};w.zukaitMechanicalEstimate={active:()=>true,save:async(estimate,revision)=>{quote=JSON.parse(JSON.stringify(estimate));save={operation:'SAVE_ESTIMATE',request_id:randomUUID(),client_key:clientKey,estimate:quote,expected_revision:revision,reason:'Synthetic Mechanical quote'};saved=await call(save);return saved.estimate;}};
  try{w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));await w.zukaitEstimate.newEstimate(null,clientKey);w.document.getElementById('estJobCard').value='QA_JC_0';w.document.getElementById('estName').value='Synthetic Mechanical customer';await w.zukaitEstimate.saveCurrent(clientKey,true);assert.equal(saved?.estimate.status,'Saved','Actual current estimate editor payload must round-trip through the scoped SQL validator');}finally{dom.window.close();}
  assert.equal(saved.estimate.createdBy,actor.id);assert.equal(saved.estimate.revision,1);assert.equal(saved.estimate.cashCustomerName,'Synthetic Mechanical customer');assert.equal((await call(save)).duplicate,true);
  await assert.rejects(call({...save,request_id:randomUUID(),expected_revision:1,estimate:{...quote,jobCard:'QA_JC_11'}}),/mechanical_estimate_forbidden/);
  assert.deepEqual((await call({operation:'READ'})).estimates.map(e=>e.id),[clientKey]);
  const request=randomUUID(),command={operation:'CREATE_DIRECT_JOB',request_id:request,job_card:'975901',job_type:'CASH',details:{make:'Toyota',model:'Corolla',registration:'QA-MECH-ONLY',year:'2022',customer:'Synthetic customer',contact:'90000000'},received_confirmed:true,reason:'Synthetic isolated Mechanical creation'};
  await assert.rejects(call(command,true),/reception_job_forbidden|reception_forbidden/,'Mechanical role must not gain the unscoped Reception RPC');
  const create={operation:'CREATE_JOB',request_id:request,command};const created=await call(create);assert.equal(created.ok,true);assert.equal(created.job_card,'975901');assert.equal((await call(create)).duplicate,true);
  const company=(await db.query("insert into workshop_insurance_companies(name,active) values('QA Mechanical insurer',true) returning id")).rows[0].id;
  for(const [kind,no] of [['CREDIT','975902'],['INSURANCE','975903']]){
   const next=randomUUID(),cmd={...command,request_id:next,job_card:no,job_type:kind,...(kind==='CREDIT'?{credit_account:'QA Mechanical credit account'}:{insurance_id:String(company),reference:'QA approval',approval_date:'2026-10-19',evidence:'Synthetic approval evidence',approval_confirmed:true})};
   const result=await call({operation:'CREATE_JOB',request_id:next,command:cmd});assert.equal(result.ok,true);assert.equal(result.job.jobType,kind);
  }
  const scoped=await call({operation:'READ'});assert.ok(scoped.jobs.some(j=>j.no==='975901'));assert.equal(scoped.jobs.some(j=>j.no==='QA_JC_11'),false);
  const after=await snapshot();assert.deepEqual(after.data.expenses,baseline.data.expenses);assert.deepEqual(after.data.assign,baseline.data.assign);assert.deepEqual(after.data.sessions,baseline.data.sessions);
  assert.equal((await db.query('select count(*)::int n from zukait_mechanical.section_audit where actor_id=$1',[actor.id])).rows[0].n,5);
 }finally{await db.exec('rollback to savepoint mechanical_sections');await db.exec('release savepoint mechanical_sections');}
 assert.deepEqual(await snapshot(),baseline);
 console.log('PASS actual scoped Mechanical sections SQL: own-domain read, official estimate allocation/save/audit/exact retry, Bodyshop binding denial, original direct Cash job validator, no unscoped Reception permission, isolated ownership and complete rollback.');
}
