import {mechanicalCommandFingerprint as digest} from './mechanical_rules.js';
// Inactive server-only unpriced projection. No routes or grants are created here.
const fail=code=>({ok:false,code}),valid=x=>Number.isSafeInteger(x)&&x>=0;
export async function mechanicalDocument(input,server={}){
 if(server.enabled!==true||server.policy?.documentsEnabled!==true)return fail('mechanical_documents_disabled');
 if(!input||Object.keys(input).some(k=>!['checklistId','expectedRevision','expectedWorkshopRevision'].includes(k))||typeof input.checklistId!=='string'||!valid(input.expectedRevision)||!valid(input.expectedWorkshopRevision))return fail('invalid_document_request');
 if(typeof server.verifySession!=='function'||typeof server.readContext!=='function')return fail('mechanical_document_adapter_required');
 const actor=await server.verifySession();
 if(actor?.active!==true||actor.id!==server.actor?.id||!['Manager','Supervisor','Mechanical Supervisor'].includes(actor.role)||!Array.isArray(server.policy.documentReaders?.[actor.id])||!server.policy.documentReaders[actor.id].includes('UNPRICED'))return fail('mechanical_document_forbidden');
 // Trusted reader must bind its own SQL session and return the two revisions from
 // one consistent snapshot. Never supply context from the client request.
 const {records,snapshot}=await server.readContext(input.checklistId);
 if(records?.revision!==input.expectedRevision||snapshot?.revision!==input.expectedWorkshopRevision)return fail('mechanical_document_changed');
 const c=records.checklists?.find(c=>c.id===input.checklistId),jc=c?.manualJobCard?.number;
 const jobs=snapshot.data?.jobs?.filter(j=>j.no===jc)||[];
 if(!c||jobs.length!==1)return fail('mechanical_document_scope_review');
 const tasks=records.tasks?.filter(t=>t.checklistId===c.id)||[],taskIds=new Set(tasks.map(t=>t.id)),links=records.links?.filter(l=>taskIds.has(l.taskId))||[];
 if(tasks.length>100||links.length>500||taskIds.size!==tasks.length)return fail('mechanical_document_limit');
 const ids=new Set(links.map(l=>l.assignmentId)),assignments=(snapshot.data.assign||[]).filter(a=>ids.has(a.id));
 if(assignments.length!==ids.size||ids.size!==links.length)return fail('mechanical_document_scope_review');
 const byId=new Map(assignments.map(a=>[a.id,a])),people=new Map((snapshot.data.users||[]).map(u=>[u.id,u]));
 let rows;try{rows=tasks.map(t=>({title:String(t.title||''),allocations:links.filter(l=>l.taskId===t.id).map(l=>{
  const a=byId.get(l.assignmentId),u=people.get(l.employeeId);
  if(!a||a.job!==jc||a.emp!==l.employeeId||a.mechanicalTaskId!==t.id||a.mechanicalChecklistId!==c.id||!u)throw Error('mechanical_document_scope_review');
  if(!Number.isSafeInteger(a.suggested)||a.suggested<0||a.suggested>60000)throw Error('mechanical_document_scope_review');
  return {employee:String(u.name||u.displayName||u.id),allocatedMinutes:a.suggested,status:l.handedOverTo?'Handed over':a.cancelled?'Cancelled':a.completed?'Completed':'Open',repeat:a.rework===true};
 })}));}catch{return fail('mechanical_document_scope_review')}
 // Construct a whitelist, never clone state. Costs, invoice data, customer data,
 // passwords, sessions, QC notes and signature material cannot enter the payload.
 const document={schema:'zukait-mechanical-unpriced-v1',checklistNumber:String(c.number),jobCard:String(jc),manualDate:String(c.manualJobCard.date),recordsRevision:records.revision,workshopRevision:snapshot.revision,rows};
 if(document.checklistNumber.length>80||document.jobCard.length>80||!/^\d{4}-\d{2}-\d{2}$/.test(document.manualDate)||rows.some(t=>!t.title||t.title.length>200||t.allocations.some(a=>a.employee.length>128)))return fail('mechanical_document_scope_review');
 const current=await server.verifySession();
 if(current?.active!==true||current.id!==actor.id||current.role!==actor.role)return fail('session_changed');
 // Adapter must recheck both revisions AND its bound session before returning.
 if(typeof server.verifyCurrent!=='function'||await server.verifyCurrent({checklistId:c.id,recordsRevision:records.revision,workshopRevision:snapshot.revision})!==true)return fail('mechanical_document_changed');
 return {ok:true,document,sourceHash:await digest({domain:'mechanical-unpriced-signature-source-v1',checklistId:input.checklistId,document})};
}
