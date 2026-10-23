import assert from 'node:assert/strict';
export async function jobNumberAcceptance({control,race}){
 const snapshot=async()=> (await control.query("select revision,data from workshop_state where id='main'")).rows[0];
 const before=await snapshot(),jobs=before.data.jobs.filter(j=>j.no!=='ID001'&&!j.cancelled&&!j.deleted),first=jobs.find(j=>j.no==='QA-LEGACY'),second=jobs.find(j=>j.no==='QA-CONCURRENT-CASH');assert.ok(first&&second);
 const ledger=await control.query('select to_jsonb(e) value from workshop_accounting_entries e order by sequence_no');
 const edit=async(client,s,no,to,expected=no,actor='QA-MGR',confirmed=true)=>{
  const data=structuredClone(s.data),j=data.jobs.find(j=>j.no===no);j.editRevision=Number(j.editRevision||0)+1;
  const r=await client.query('select zukait_manager_numbered_job_edit($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[s.revision,data,actor,no,'Correct imported Job Card number','[]',to,expected,confirmed]);return r.rows[0].result;
 };
 await assert.rejects(edit(control,before,first.no,'990001',first.no,'QA-SUP'),/job_edit_manager_required/);
 await assert.rejects(edit(control,before,first.no,'990001',first.no,'QA-MGR',false),/job_number_confirmation_required/);
 await assert.rejects(edit(control,before,first.no,'0990001'),/job_number_invalid/);
 const r=await race('two Managers cannot claim the same public Job Card number',c=>edit(c,before,first.no,'990001'),c=>edit(c,before,second.no,'990001'));
 assert.equal(r.first.ok,true);assert.equal(r.second.code,'conflict');
 await assert.rejects(edit(control,await snapshot(),second.no,'990001'),/job_number_duplicate/);
 await assert.rejects(edit(control,await snapshot(),first.no,'990002'),/job_number_conflict/);
 const next=await edit(control,await snapshot(),first.no,'990002','990001');assert.equal(next.ok,true);
 await assert.rejects(edit(control,await snapshot(),second.no,'990001'),/job_number_duplicate/,'retired numbers stay reserved');
 for(const no of ['990001','990002','0990002'])await assert.rejects(control.query('insert into workshop_v2_jobcards(job_card) values($1)',[no]),/job_number_duplicate/,'raw projection creation cannot reuse a reserved number');
 const after=await snapshot();for(const k of ['assign','sessions','expenses','consumables','sublets','paintPurchasing'])assert.deepEqual(after.data[k],before.data[k],k+' must retain stable keys and all values');
 assert.equal(after.data.jobs.find(j=>j.no===first.no).no,first.no);assert.deepEqual((await control.query('select to_jsonb(e) value from workshop_accounting_entries e order by sequence_no')).rows,ledger.rows);
 await assert.rejects(control.query("update workshop_job_number_audit set reason='tampered'"),/job_number_audit_immutable/);
 const rights=(await control.query("select has_function_privilege('anon','zukait_manager_numbered_job_edit(bigint,jsonb,text,text,text,jsonb,text,text,boolean)','execute') public_rpc,has_table_privilege('authenticated','workshop_job_numbers','select') public_read,has_table_privilege('service_role','workshop_job_number_audit','update') audit_update")).rows[0];assert.deepEqual(rights,{public_rpc:false,public_read:false,audit_update:false});
 console.log('PASS numbering transaction, real two-device overlap, duplicate and retired-number protection, raw creation guard, unchanged work/ledger and restricted immutable audit');
}
