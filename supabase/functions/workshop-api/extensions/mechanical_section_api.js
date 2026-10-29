import {workedMinutes} from '../time_management_rules.js';
import {mechanicalRoute} from './mechanical_route.js';
export async function mechanicalSectionApi(admin,actor,body,options){
 const fail=(code,status)=>({status,body:{ok:false,code}});
 if(options.enabled!==true)return fail('extension_disabled',403);
 if(!(actor?.role==='Manager'||actor?.id==='SUP003'&&['Supervisor','Mechanical Supervisor'].includes(actor.role)))return fail('mechanical_forbidden',403);
 if(!body.command||typeof body.command!=='object'||Array.isArray(body.command)||Object.keys(body).some(k=>!['action','command'].includes(k))||JSON.stringify(body.command).length>70000)return fail('invalid_mechanical_section',400);
 try{
  const {data,error}=await admin.rpc('zukait_mechanical_section',{p_actor:actor.id,p_session_hash:options.sessionHash,p_command:body.command});if(error)throw error;
  if(body.command.operation!=='READ')return {status:200,body:data};
  const result={...data,assign:(data.assign||[]).map(a=>({id:a.id,job:a.job,emp:a.emp,suggested:a.suggested,completed:a.completed,cancelled:a.cancelled,handedOverToAssignmentId:a.handedOverToAssignmentId,workedMinutes:workedMinutes(data,a)}))};
  delete result.sessions;delete result.workshopHolidays;
  if(options.qcEnabled===true&&['qc','ready'].includes(body.command.view)){const qc=await mechanicalRoute(admin,actor,{action:'mechanical_qc_overview'},options);if(qc.status!==200)return qc;const jobs=new Set(result.jobs.map(j=>String(j.no))),rows=qc.body.rows.filter(r=>jobs.has(String(r.jobCard)));result.qc={ok:true,rows};}
  const fresh=await options.verifySession();if(!fresh||fresh.id!==actor.id||fresh.role!==actor.role)return fail('invalid_session',401);
  return {status:200,body:result};
 }catch(error){const code=String(error?.message||'');const known=/^(mechanical_|invalid_mechanical_|reception_|job_number_|time_|estimate_draft_deleted)/.test(code);return fail(known?code:'mechanical_section_unavailable',code==='mechanical_invalid_session'?401:/forbidden/.test(code)?403:known?409:503);}
}
