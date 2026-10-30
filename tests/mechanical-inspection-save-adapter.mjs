import assert from 'node:assert/strict';
import {createMechanicalInspectionSaveAdapter} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_save_adapter.js';
const command={
 checklistId:'11111111-1111-4111-8111-111111111111',
 requestId:'22222222-2222-4222-8222-222222222222',
 actorId:'SUP003',expectedRevision:0,
 inspection:{jobType:'CASH',workDescription:'Test'}
};
let writes=0;
const adapter=createMechanicalInspectionSaveAdapter({
 authorizeChecklist:async input=>{
  assert.equal(input.actorId,'SUP003');
  assert.equal(input.operation,'SAVE_INSPECTION');
  return true;
 },
 executeAtomicSave:async input=>{
  writes++;
  assert.equal(input.requestId,command.requestId);
  return {revision:1,replayed:false};
 }
});
assert.deepEqual(await adapter(command),{revision:1,replayed:false});
assert.equal(writes,1);
const denied=createMechanicalInspectionSaveAdapter({
 authorizeChecklist:async()=>false,
 executeAtomicSave:async()=>{writes++;return {revision:1,replayed:false};}
});
await assert.rejects(()=>denied(command),e=>e.code==='42501');
assert.equal(writes,1,'denied save must not execute');
await assert.rejects(()=>createMechanicalInspectionSaveAdapter({executeAtomicSave:async()=>{writes++;}})(command),e=>e.code==='08006');
await assert.rejects(()=>adapter({...command,requestId:'invalid'}),e=>e.code==='22023');
assert.equal(writes,1);
console.log('PASS inactive Mechanical inspection save adapter authorization');
