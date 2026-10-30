import assert from 'node:assert/strict';
import {mechanicalInspectionBoundary} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_boundary.js';
import {INSPECTION_FUNCTIONS} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_contract.js';
const id='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const inspection={jobType:'CASH',vehicle:{registration:'1234 AB',make:'Toyota',model:'Camry',year:'2022',customer:'Test',contact:'90000000'},damageMarks:[],functions:Object.fromEntries(INSPECTION_FUNCTIONS.map(k=>[k,{status:'NOT_CHECKED'}])),workDescription:'Inspection'};
let reads=0,writes=0;
const context={
 enabled:true,policy:{flags:{mechanical:true}},actor:{id:'SUP003',role:'Supervisor',department:'Mechanical'},
 verifySession:async()=>({id:'SUP003',active:true,role:'Supervisor',department:'Mechanical'}),
 authorizeChecklist:async()=>true,
 db:{schema:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{reads++;return {data:null,error:null};}})})})})},
 executeAtomicSave:async()=>{writes++;return {revision:1,replayed:false};}
};
const read=await mechanicalInspectionBoundary({operation:'READ_INSPECTION',checklistId:id},context);
assert.equal(read.status,200);
assert.equal(read.body.inspection,null);
const saved=await mechanicalInspectionBoundary({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},context);
assert.equal(saved.status,200);
assert.equal(saved.body.result.revision,1);
assert.equal(reads,1);assert.equal(writes,1);
const denied={...context,authorizeChecklist:async()=>false};
assert.equal((await mechanicalInspectionBoundary({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},denied)).status,403);
assert.equal((await mechanicalInspectionBoundary({operation:'READ_INSPECTION',checklistId:id},denied)).status,403);
assert.equal(reads,1);assert.equal(writes,1);
assert.equal((await mechanicalInspectionBoundary({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},{...context,enabled:false})).status,403);
assert.equal(writes,1);
console.log('PASS inactive Mechanical inspection composed boundary');
