import assert from 'node:assert/strict';
import {createMechanicalInspectionReadAdapter} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_read_adapter.js';
const id='11111111-1111-4111-8111-111111111111';
const actor={id:'SUP003',active:true,role:'Supervisor'};
let queries=0;
const db={
 schema:name=>{
  assert.equal(name,'zukait_mechanical');
  return {from:table=>{
   assert.equal(table,'inspection_details');
   return {select:()=>({
    eq:(key,value)=>{
     assert.equal(key,'checklist_id');
     assert.equal(value,id);
     return {maybeSingle:async()=>{
      queries++;
      return {data:{
       checklist_id:id,revision:2,job_type:'CASH',
       vehicle:{registration:'1234 AB'},damage_marks:[],function_checks:{},
       work_description:'Inspection',updated_at:'2026-10-30',updated_by:'SUP003'
      },error:null};
     }};
    }
   })};
  }};
 }
};
const adapter=createMechanicalInspectionReadAdapter({db,authorizeChecklist:async()=>true});
const result=await adapter(id,actor);
assert.equal(result.revision,2);
assert.equal(result.inspection.jobType,'CASH');
assert.equal(result.inspection.workDescription,'Inspection');
assert.equal(queries,1);
const denied=createMechanicalInspectionReadAdapter({db,authorizeChecklist:async()=>false});
await assert.rejects(()=>denied(id,actor),e=>e.code==='42501');
assert.equal(queries,1,'denied read must not query inspection details');
await assert.rejects(()=>createMechanicalInspectionReadAdapter({db})(id,actor),e=>e.code==='08006');
await assert.rejects(()=>adapter('bad',actor),e=>e.code==='22023');
console.log('PASS inactive Mechanical inspection read adapter authorization');
