import assert from 'node:assert/strict';
import {mechanicalInspectionApi} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_api.js';
import {INSPECTION_FUNCTIONS} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_contract.js';
const id='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const inspection={jobType:'CASH',vehicle:{registration:'1234 AB',make:'Toyota',model:'Camry',year:'2022',customer:'Test',contact:'90000000'},damageMarks:[],functions:Object.fromEntries(INSPECTION_FUNCTIONS.map(k=>[k,{status:'NOT_CHECKED'}])),workDescription:'Inspection'};
const server={enabled:true,policy:{flags:{mechanical:true}},actor:{id:'SUP003',role:'Supervisor',department:'Mechanical'},verifySession:async()=>({id:'SUP003',active:true,role:'Supervisor',department:'Mechanical'}),authorizeChecklist:async()=>true,readInspection:async()=>null,saveInspection:async x=>({revision:x.expectedRevision+1})};
const denied=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,authorizeChecklist:async()=>false});
assert.equal(denied.status,403);
const missingPolicy=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,authorizeChecklist:undefined});
assert.equal(missingPolicy.status,503);
const read=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},server);
assert.equal(read.status,200);assert.equal(read.body.inspection,null);
const saved=await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},server);
assert.equal(saved.body.result.revision,1);
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection:{...inspection,jobType:'INSURANCE'}},server)).body.code,'invalid_mechanical_job_type');
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,enabled:false})).status,403);
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,actor:{id:'SUP001',role:'Supervisor',department:'Mechanical'},verifySession:async()=>({id:'SUP001',active:true,role:'Supervisor',department:'Mechanical'})})).status,403);
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,readInspection:undefined})).status,503);
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},{...server,readInspection:undefined})).status,200);
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection:{...inspection,workDescription:'x'.repeat(17000)}},server)).body.code,'invalid_command');
let sessionChecks=0;
const changedSession={...server,verifySession:async()=>++sessionChecks===1?{id:'SUP003',active:true,role:'Supervisor',department:'Mechanical'}:{id:'SUP003',active:false,role:'Supervisor',department:'Mechanical'}};
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},changedSession)).status,401);
let readCalls=0;
const guardedRead={...server,readInspection:async()=>{readCalls++;return null;}};
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id,requestId},guardedRead)).body.code,'invalid_command');
assert.equal(readCalls,0,'malformed read must not invoke adapter');
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id,inspection},guardedRead)).body.code,'invalid_command');
assert.equal(readCalls,0);
let readSessionChecks=0;
let guardedReadCalls=0;
const revokedRead={...server,verifySession:async()=>++readSessionChecks===1
 ?{id:'SUP003',active:true,role:'Supervisor',department:'Mechanical'}
 :{id:'SUP003',active:false,role:'Supervisor',department:'Mechanical'},
 readInspection:async()=>{guardedReadCalls++;return null;}};
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},revokedRead)).status,401);
assert.equal(guardedReadCalls,0,'revoked session must not reach read adapter');
let lateChecks=0;
const revokedDuringRead={...server,verifySession:async()=>({id:'SUP003',active:++lateChecks<3,role:'Supervisor',department:'Mechanical'}),readInspection:async()=>({revision:1})};
const lateResult=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},revokedDuringRead);
assert.equal(lateResult.status,401);
assert.equal(lateResult.body.ok,false);
assert.equal(lateChecks,3,'must verify again before returning private inspection');
let deptChecks=0;
const changedDepartment={...server,verifySession:async()=>({id:'SUP003',active:true,role:'Supervisor',department:'Mechanical',department:++deptChecks===3?'Body':'Mechanical'}),readInspection:async()=>({revision:1})};
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},changedDepartment)).status,401);
assert.equal(deptChecks,3);
let saveDeptChecks=0,saveDeptCalls=0;
const changedSaveDepartment={...server,verifySession:async()=>({id:'SUP003',active:true,role:'Supervisor',department:'Mechanical',department:++saveDeptChecks===2?'Body':'Mechanical'}),saveInspection:async()=>{saveDeptCalls++;}};
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},changedSaveDepartment)).status,401);
assert.equal(saveDeptCalls,0);
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:Number.MAX_SAFE_INTEGER,inspection},server)).body.code,'invalid_command');
for(const [code,status,expected] of [
 ['40001',409,'inspection_revision_conflict'],
 ['23505',409,'inspection_request_conflict'],
 ['P0002',404,'inspection_checklist_not_found'],
 ['22023',400,'invalid_inspection'],
 ['42501',403,'mechanical_forbidden'],
 ['08006',503,'mechanical_storage_unavailable']
]){
 const failing={...server,saveInspection:async()=>{throw {code};}};
 const result=await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},failing);
 assert.equal(result.status,status);
 assert.equal(result.body.code,expected);
 assert.equal(result.body.ok,false);
}
const readFailure=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id},{...server,readInspection:async()=>{throw {code:'08006'};}});
assert.equal(readFailure.status,503);
let saveAfterFailure=0;
const throwingFirst={...server,verifySession:async()=>{throw Error('session backend offline');},saveInspection:async()=>{saveAfterFailure++;}};
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},throwingFirst)).status,401);
assert.equal(saveAfterFailure,0);
let recheckCount=0;
const throwingSecond={...server,verifySession:async()=>{if(++recheckCount===2)throw Error('session revoked');return {id:'SUP003',active:true,role:'Supervisor',department:'Mechanical'};},saveInspection:async()=>{saveAfterFailure++;}};
assert.equal((await mechanicalInspectionApi({operation:'SAVE_INSPECTION',checklistId:id,requestId,expectedRevision:0,inspection},throwingSecond)).status,401);
assert.equal(saveAfterFailure,0,'failed verification must never reach storage');
const circular={operation:'READ_INSPECTION',checklistId:id};
circular.self=circular;
assert.equal((await mechanicalInspectionApi(circular,server)).body.code,'invalid_command');
assert.equal((await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:id,unexpected:1n},server)).body.code,'invalid_command');
console.log('PASS inactive Mechanical inspection API boundary');
