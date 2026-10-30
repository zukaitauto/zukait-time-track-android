// Inactive V377 integration boundary. This does NOT register a live route.
// Production wiring must inject a session verifier and a trusted transactional
// save executor that rechecks session/role/ownership inside the transaction.
import {mechanicalInspectionApi} from './mechanical_inspection_api.js';
import {createMechanicalInspectionReadAdapter} from './mechanical_inspection_read_adapter.js';
import {createMechanicalInspectionSaveAdapter} from './mechanical_inspection_save_adapter.js';
export async function mechanicalInspectionBoundary(input,context={}){
 const {db,authorizeChecklist,executeAtomicSave,verifySession,actor,policy,enabled}=context;
 // The inspection API must never accept a merely pre-authorized save:
 // the executor is required to revalidate access inside its transaction.
 const safeExecutor=typeof executeAtomicSave==='function' &&
   executeAtomicSave.authorizesInTransaction===true
   ? executeAtomicSave : undefined;
 const readInspection=createMechanicalInspectionReadAdapter({db,authorizeChecklist});
 const saveInspection=createMechanicalInspectionSaveAdapter({authorizeChecklist,executeAtomicSave:safeExecutor});
 return mechanicalInspectionApi(input,{
  enabled,policy,actor,verifySession,authorizeChecklist,readInspection,saveInspection
 });
}
