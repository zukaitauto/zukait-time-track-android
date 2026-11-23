import {mechanicalTimeProjection,mechanicalTimeTransition,mechanicalEmployeeTimeToken} from './mechanical_time_rules.js';
const response=(code,status=409)=>({status,body:{ok:false,code}});
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}

export async function mechanicalTimeApi(admin,actor,body,options){
 if(options.enabled!==true)return response('extension_disabled',403);
 if(!(actor?.role==='Manager'||actor?.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(actor.role)))return response('mechanical_time_forbidden',403);
 if(!['READ','CHANGE'].includes(body.operation)||Object.keys(body).some(k=>!['action','operation','query','jobCard','command'].includes(k))||JSON.stringify(body).length>16000)return response('invalid_command',400);
 const rpc=async(name,args)=>{const {data,error}=await admin.rpc(name,args);if(error)throw error;return data;};
 const auth=()=>rpc('zukait_mechanical_read',{p_actor:actor.id,p_session_hash:options.sessionHash,p_operation:'TASK_ASSIGN',p_kind:'policy'});
 try{
  const policy=await auth(),checklists=[];let after=0;
  // Explicit foreground pagination. Refuse an incomplete scope at the limit.
  for(let page=0;page<40;page++){
   const view=await rpc('zukait_mechanical_dashboard',{p_actor:actor.id,p_session_hash:options.sessionHash,p_after:after,p_checklist:null});
   checklists.push(...(view.checklists||[]));if(view.nextAfter==null)break;
   if(!Number.isSafeInteger(view.nextAfter)||view.nextAfter<=after||page===39)return response('mechanical_time_limit',503);after=view.nextAfter;
  }
  const selected=body.jobCard?checklists.find(c=>String(c.jobCard)===String(body.jobCard)):null;
  if(body.jobCard&&!selected)return response('mechanical_time_job_required',403);
  const context={enabled:true,sessionCurrent:true,department:policy.mechanicalDepartment,checklists,tasks:[],links:[]};
  if(selected){
   const view=await rpc('zukait_mechanical_dashboard',{p_actor:actor.id,p_session_hash:options.sessionHash,p_after:0,p_checklist:selected.id});
   if(!view.detail||view.detail.checklist?.id!==selected.id)return response('mechanical_time_job_required',403);
   context.checklists=[selected];context.recordsRevision=view.recordsRevision;context.tasks=(view.detail.tasks||[]).map(t=>({...t,checklistId:selected.id}));
   context.links=(view.detail.assignments||[]).map(a=>({taskId:a.taskId,assignmentId:a.id,employeeId:a.employeeId}));
  }
  for(let attempt=0;attempt<(body.operation==='CHANGE'?8:1);attempt++){
   const {data:current,error}=await admin.from('workshop_state').select('revision,data').eq('id','main').single();if(error)throw error;
   const {data:staff,error:staffError}=await admin.from('staff_credentials').select('user_id,display_name,role,department,active');if(staffError)throw staffError;
   // Server account records, not an old client snapshot, own department scope.
   const snapshot={...current.data,users:staff.map(u=>({id:u.user_id,name:u.display_name,role:u.role,department:u.department,active:u.active}))};
   if(body.operation==='READ'){
    const result=mechanicalTimeProjection(snapshot,actor,context);if(!result.ok)return response(result.code,403);
    const q=String(body.query||'').trim().toLowerCase();if(q.length>100)return response('invalid_command',400);
    result.jobs=result.jobs.filter(j=>!q||[j.no,j.reg,j.vehicle,j.make,j.model].some(v=>String(v||'').toLowerCase().includes(q)));
    if(!selected){result.jobs=result.jobs.slice(0,30);result.users=[];result.assign=[];result.sessions=[];result.audit=[];}
    result.employeeTokens={};for(const a of result.assign)result.employeeTokens[a.emp]=await digest(mechanicalEmployeeTimeToken(snapshot,a.emp));
    return {status:200,body:{...result,checklist:selected||null,taskOptions:context.tasks,recordsRevision:context.recordsRevision,server_revision:current.revision}};
   }
   if(!selected||!body.command||typeof body.command!=='object'||Array.isArray(body.command))return response('invalid_command',400);
   const command={...body.command},a=snapshot.assign?.find(a=>String(a.id)===String(command.assignmentId));
   const prior=(snapshot.additionalActions||[]).find(r=>r.id===command.requestId&&r.by===actor.id);
   if(a&&command.expectedSessions!==undefined){
    const token=mechanicalEmployeeTimeToken(snapshot,a.emp);
    if(!prior&&command.expectedSessions!==await digest(token))return response('time_sessions_changed');
    command.expectedSessions=token;
   }
   const result=mechanicalTimeTransition(snapshot,actor,command,context,Date.now());
   if(!result.ok)return response(result.code,result.code==='mechanical_time_job_required'?403:409);
   if(result.duplicate)return {status:200,body:{ok:true,audit:result.audit,duplicate:true,server_revision:current.revision}};
   // Do not overwrite the authoritative workshop user snapshot with auth rows.
   result.data.users=current.data.users;
   const fresh=await options.verifySession();if(!fresh||fresh.id!==actor.id||fresh.role!==actor.role)return response('invalid_session',401);
   await auth();
   const committed=await options.commit(current.revision,result.data,actor.id,command.assignmentId);
   if(committed?.ok)return {status:200,body:{ok:true,audit:result.audit,server_revision:committed.revision}};
   if(committed?.code!=='conflict')return response(committed?.code||'time_commit_failed');
  }
  return response('time_conflict');
 }catch(error){
  const code=String(error?.message||'');
  return response(['mechanical_disabled','mechanical_forbidden'].includes(code)?'mechanical_time_forbidden':code==='mechanical_invalid_session'?'invalid_session':'mechanical_time_unavailable',code==='mechanical_invalid_session'?401:['mechanical_disabled','mechanical_forbidden'].includes(code)?403:503);
 }
}
