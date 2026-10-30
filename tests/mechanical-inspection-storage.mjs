import assert from 'node:assert/strict';
import {createMechanicalInspectionStorage} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_storage.js';
const checklistId='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const calls=[];
const admin={rpc:async(name,params)=>{
 calls.push({name,params});
 if(name==='zukait_mechanical_inspection_read')return {error:null,data:{
  ok:true,checklist:{id:checklistId,number:'MC0001',jobCard:'MJC001'},
  inspection:null}};
 if(name==='zukait_mechanical_inspection_save')return {error:null,data:{revision:1,replayed:false}};
 throw Error('unexpected RPC');
}};
const storage=createMechanicalInspectionStorage({admin,actor:{id:'SUP003'},sessionHash:'a'.repeat(64)});
assert.equal(await storage.authorizeChecklist({checklistId,actor:{id:'SUP003'}}),true);
assert.equal(await storage.authorizeChecklist({checklistId,actorId:'SUP001'}),false);
assert.equal(await storage.authorizeChecklist({checklistId,actor:{id:'SUP001'}}),false);
assert.equal((await storage.executeAuthorizedRead(checklistId)).checklist.id,checklistId);
assert.equal(storage.executeAtomicSave.authorizesInTransaction,true);
const command={actorId:'SUP003',checklistId,requestId,expectedRevision:0,inspection:{jobType:'CASH'}};
assert.deepEqual(await storage.executeAtomicSave(command),{revision:1,replayed:false});
assert.equal(calls.filter(c=>c.name==='zukait_mechanical_inspection_save').length,1);
assert.equal(calls.at(-1).params.p_session_hash,'a'.repeat(64));
await assert.rejects(()=>storage.executeAtomicSave({...command,actorId:'SUP001'}),e=>e.code==='22023');
assert.equal(calls.filter(c=>c.name==='zukait_mechanical_inspection_save').length,1);
const revoked=createMechanicalInspectionStorage({admin:{rpc:async()=>({
 data:null,error:{code:'P0001',message:'mechanical_invalid_session'}
})},actor:{id:'SUP003'},sessionHash:'b'.repeat(64)});
await assert.rejects(()=>revoked.executeAuthorizedRead(checklistId),e=>e.code==='42501');
const unavailable=createMechanicalInspectionStorage({admin:null,actor:{id:'SUP003'},sessionHash:'a'.repeat(64)});
assert.equal(await unavailable.authorizeChecklist({checklistId,actorId:'SUP003'}),false);
await assert.rejects(()=>unavailable.executeAtomicSave(command),e=>e.code==='42501');
console.log('PASS Mechanical inspection authenticated RPC transport');
