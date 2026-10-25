// Read-only projection. Internal context is never returned to browsers.
import {qcStatus} from '../qc_delivery_rules.js';
import {mechanicalQcReadiness} from './mechanical_qc_boundary.js';
const key=x=>String(x??'').trim().toUpperCase(),group=(rows,fn)=>{const m=new Map();for(const r of rows){const k=fn(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return m};
export async function mechanicalQcOverview(context,at=Date.now()){
 const {actor,policy,records,snapshot,approvals}=context||{},data=snapshot?.data;
 if(!actor?.active||!['Manager','Supervisor','Mechanical Supervisor'].includes(actor.role)||!data||!Array.isArray(approvals)||!['jobs','assign','sessions','users'].every(k=>Array.isArray(data[k]))||!['checklists','tasks','links'].every(k=>Array.isArray(records?.[k])))return {ok:false,code:'mechanical_qc_scope_review'};
 if(data.jobs.length>1000||data.assign.length>10000||data.sessions.length>50000||records.checklists.length>1000||records.tasks.length>5000||records.links.length>10000)return {ok:false,code:'mechanical_overview_limit'};
 const assignments=group(data.assign,a=>key(a.job)),sessions=group(data.sessions,s=>key(s.job)),checklists=group(records.checklists,c=>key(c.manualJobCard?.number)),tasks=group(records.tasks,t=>t.checklistId),links=group(records.links,l=>l.taskId),users=new Map(data.users.map(u=>[u.id,u])),events=new Map(approvals.map(e=>[e.checklistId,e]));
 const rows=[],seen=new Set();
 for(const job of data.jobs){
  const no=key(job?.no);if(!no||seen.has(no))return {ok:false,code:'mechanical_qc_scope_review'};seen.add(no);
  if(no==='ID001'||job.delivered||job.cancelled||job.archived||job.deleted||key(job.status)==='CANCELLED')continue;
  const assign=assignments.get(no)||[],scoped={jobs:[job],assign,sessions:sessions.get(no)||[],users:[...new Set(assign.map(a=>a.emp))].map(id=>users.get(id)).filter(Boolean)},legacy=qcStatus(scoped,job),matches=checklists.get(no)||[];
  const row={jobCard:job.no,vehicle:String(job.vehicle||''),registration:String(job.reg||''),mechanical:matches.length>0,route:'LEGACY',checklistId:null,workComplete:legacy.workComplete,paintingRequired:true,finalRequired:true,painting:legacy.painting,final:legacy.final,mechanicalRequired:false,mechanicalPassed:false,reviewRequired:false,deliveryReady:legacy.deliveryReady,stage:legacy.stage,readyAt:Number(job.qcWorkflow?.final?.at||0),qcVisible:false,canPaint:false,canFinal:false,canMechanical:false};
  if(matches.length){
   if(matches.length!==1)return {ok:false,code:'mechanical_qc_scope_review'};
   const checklist=matches[0],selectedTasks=tasks.get(checklist.id)||[],selectedLinks=selectedTasks.flatMap(t=>links.get(t.id)||[]),approval=events.get(checklist.id)||null;
   const status=await mechanicalQcReadiness({...records,checklists:[checklist],tasks:selectedTasks,links:selectedLinks}, {revision:snapshot.revision,data:scoped},job.no,policy,approval);
   row.checklistId=checklist.id;
   if(!status.ok){row.reviewRequired=true;row.code=status.code;row.route=status.code==='mechanical_mixed_qc_policy_required'?'MIXED':'REVIEW';row.deliveryReady=false;row.stage='REVIEW_REQUIRED'}
   else{Object.assign(row,{route:status.route,workComplete:status.workComplete,mechanicalRequired:status.mechanicalRequired,mechanicalPassed:status.mechanicalPassed,deliveryReady:status.deliveryReady});row.readyAt=Math.max(row.readyAt,status.mechanicalRequired?Number(approval?.at||0):0)}
   row.paintingRequired=row.route==='MIXED';row.finalRequired=row.route==='MIXED';
   if(row.route==='REVIEW'){row.paintingRequired=false;row.finalRequired=false}
  }
  if(!row.reviewRequired)row.stage=!row.workComplete?'WORK_PENDING':row.paintingRequired&&!row.painting?'PAINTING_QC':row.finalRequired&&!row.final?'FINAL_QC':row.mechanicalRequired&&!row.mechanicalPassed?'MECHANICAL_QC':'DELIVERY';
  row.canPaint=actor.role==='Supervisor'&&actor.id==='SUP002'&&row.workComplete&&row.paintingRequired&&!row.painting;
  row.canFinal=actor.role==='Supervisor'&&actor.id==='SUP001'&&row.workComplete&&row.finalRequired&&row.painting&&!row.final;
  row.canMechanical=['Supervisor','Mechanical Supervisor'].includes(actor.role)&&actor.id==='SUP003'&&row.workComplete&&row.mechanicalRequired&&!row.mechanicalPassed&&!row.reviewRequired&&policy.mechanicalStaff?.[actor.id]?.includes('MECHANICAL_QC')===true;
  row.qcVisible=actor.role==='Manager'?(row.reviewRequired||(row.workComplete&&!row.deliveryReady)):
   actor.id==='SUP003'?(row.mechanical&&(row.reviewRequired||(row.workComplete&&row.mechanicalRequired&&!row.mechanicalPassed))):
   actor.id==='SUP002'?row.canPaint:actor.id==='SUP001'?(row.workComplete&&row.finalRequired&&(!row.painting||!row.final)):false;
  if(actor.role!=='Mechanical Supervisor'||row.mechanical)rows.push(row);
 }
 return {ok:true,actorId:actor.id,actorRole:actor.role,recordsRevision:records.revision,workshopRevision:snapshot.revision,capturedAt:at,rows,counts:{qc:rows.filter(r=>r.qcVisible).length,ready:rows.filter(r=>r.deliveryReady).length,review:rows.filter(r=>r.reviewRequired).length}};
}
