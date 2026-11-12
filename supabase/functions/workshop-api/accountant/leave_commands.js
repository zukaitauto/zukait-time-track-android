// Accountant leave management: a narrow, audited workshop-state command.
// It does not grant generic workshop save or Manager role authority.
import {validDay,day} from './finance_rules.js';
const entries=value=>Array.isArray(value)?value:[];
const allowed=new Set(['ADD','EDIT','CANCEL']);
const safeId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const result=(code,status=400)=>({status,body:{ok:false,code}});
const interval=(date,period)=>{
 const base=Date.parse(date+'T00:00:00Z');
 return (period==='AM'?[[4,9]]:period==='PM'?[[11,15]]:[[4,9],[11,15]])
  .map(([start,end])=>[base+start*3600000,base+end*3600000]);
};
function validateCandidate(data,candidate,oldId,now,afterWork){
 if(!safeId(candidate.emp)||!validDay(candidate.date)||!['FULL','AM','PM'].includes(candidate.period))return 'invalid_leave';
 const holidays=new Set(entries(data.workshopHolidays).map(v=>typeof v==='string'?v:String(v?.date||v?.dateKey||v?.day||'')));
 if(new Date(candidate.date+'T00:00:00Z').getUTCDay()===5||holidays.has(candidate.date))return 'closed_leave_day';
 const duplicate=entries(data.leaves).some(row=>row&&!row.cancelled&&String(row.id)!==String(oldId||'')&&
  String(row.emp)===candidate.emp&&row.date===candidate.date&&
  (row.period==='FULL'||candidate.period==='FULL'||row.period===candidate.period));
 if(duplicate)return 'duplicate_leave';
 const shifts=interval(candidate.date,candidate.period),overlap=(a,b)=>shifts.some(([start,end])=>Math.max(a,start)<Math.min(b,end));
 const conflicts=entries(data.sessions).filter(s=>s&&!s.cancelled&&!s.voided&&String(s.emp)===candidate.emp&&
  Number.isFinite(Number(s.start))&&Number(s.start)>0&&overlap(Number(s.start),s.end==null?now:Number(s.end)));
 if(conflicts.some(s=>s.end==null||!Number.isFinite(Number(s.end))))return 'active_work_conflict';
 if(conflicts.length){
  if(!afterWork)return 'work_conflict';
  const lastEnd=Math.max(...conflicts.map(s=>Number(s.end)));
  candidate.startAt=lastEnd;candidate.afterWork=true;
  if(!shifts.some(([start,end])=>end>Math.max(start,lastEnd)))return 'no_remaining_leave';
 }else{delete candidate.startAt;delete candidate.afterWork;}
 return null;
}
export function prepareLeaveMutation(state,user,command,requestId,now,staffRole){
 if(!user||!['Accountant','Manager'].includes(user.role))return result('leave_forbidden',403);
 if(!uuid(requestId)||!command||typeof command!=='object'||Array.isArray(command)||!allowed.has(command.operation)||
  Object.keys(command).some(k=>!['operation','leave_id','emp','date','period','remark','reason','after_work'].includes(k)))
  return result('invalid_leave_command');
 const operation=command.operation;
 if(!['Employee','Supervisor'].includes(staffRole))return result('leave_target_forbidden',403);
 const rows=entries(state.leaves),old=operation==='ADD'?null:rows.find(x=>x&&String(x.id)===String(command.leave_id)&&!x.cancelled);
 if(operation!=='ADD'&&!old)return result('leave_not_found',404);
 const reason=String(command.reason||'').trim();
 if((operation!=='ADD'||command.after_work||command.date<day(now))&&(reason.length<3||reason.length>500))return result('leave_reason_required');
 if(String(command.remark||'').length>2000)return result('invalid_leave_remark');
 const changed=JSON.parse(JSON.stringify(state)),out=changed.leaves=entries(changed.leaves),audit=changed.leaveAudit=entries(changed.leaveAudit);
 let target,previous=old?JSON.parse(JSON.stringify(old)):null;
 if(operation==='CANCEL'){
  target=out.find(x=>String(x?.id)===String(old.id));
  target.cancelled=true;target.cancelledAt=now;target.cancelledBy=user.id;target.cancelReason=reason;
 }else{
  const emp=String(command.emp||old?.emp||''),date=String(command.date||old?.date||''),period=String(command.period||old?.period||''),remark=String(command.remark??old?.remark??'').trim();
  target=old?out.find(x=>String(x?.id)===String(old.id)):
   {id:requestId,emp,date,period,remark,by:user.id,createdAt:now,cancelled:false};
  const proposed={...target,emp,date,period,remark};
  const problem=validateCandidate(changed,proposed,old?.id,now,command.after_work===true);
  if(problem)return result(problem,409);
  if(operation==='ADD'){
   if(date<day(now)){proposed.backdated=true;proposed.backdateReason=reason;}
   out.push(proposed);target=proposed;
  }else{
   Object.assign(target,proposed,{updatedAt:now,updatedBy:user.id});
   if(!('startAt' in proposed)){delete target.startAt;delete target.afterWork;}
  }
 }
 audit.push({id:requestId+':audit',requestId,action:operation==='CANCEL'?'DELETE':operation,leaveId:target.id,
  by:user.id,at:now,reason,leaveDate:target.date,
  before:previous,after:JSON.parse(JSON.stringify(target))});
 return {status:200,body:{ok:true,leave_id:target.id},data:changed};
}
export async function accountantLeaveCommand(admin,user,body,now,computeLiveStatus){
 if(typeof computeLiveStatus!=='function')return result('leave_authority_unavailable',503);
 const requestId=body.request_id,operation=body.command?.operation;
 if(!uuid(requestId)||!allowed.has(operation)||!Number.isSafeInteger(body.expected_revision)||body.expected_revision<0)
  return result('invalid_leave_command');
 const source=await admin.from('workshop_state').select('revision,data').eq('id','main').single();
 if(source.error)throw source.error;
 const current=source.data;
 const prior=entries(current.data?.leaveAudit).find(x=>x?.requestId===requestId);
 if(prior)return JSON.stringify(prior.command)===JSON.stringify(body.command)?{status:200,body:{ok:true,leave_id:prior.leaveId,replayed:true}}:result('leave_request_conflict',409);
 if(current.revision!==body.expected_revision)return result('leave_revision_conflict',409);
 const targetId=operation==='CANCEL'?current.data?.leaves?.find(x=>String(x?.id)===String(body.command.leave_id))?.emp:
  String(body.command?.emp||current.data?.leaves?.find(x=>String(x?.id)===String(body.command?.leave_id))?.emp||'');
 if(!safeId(targetId))return result('leave_target_missing');
 const staff=await admin.from('staff_credentials').select('user_id,role,active').eq('user_id',targetId).maybeSingle();
 if(staff.error)throw staff.error;
 if(!staff.data||!['Employee','Supervisor'].includes(staff.data.role)||
  operation==='ADD'&&staff.data.active!==true)return result('leave_target_forbidden',403);
 const outcome=prepareLeaveMutation(current.data,user,body.command,requestId,now,staff.data.role);
 if(!outcome.body.ok)return outcome;
 outcome.data.leaveAudit.at(-1).command=JSON.parse(JSON.stringify(body.command));
 const next=current.revision+1;
 const committed=await admin.rpc('zukait_commit_workshop_state_v2',{p_expected_revision:current.revision,
  p_data:outcome.data,p_changed_by:user.id,p_live:computeLiveStatus(outcome.data,next,user.id)});
 if(committed.error)throw committed.error;
 if(!committed.data?.ok)return result('leave_revision_conflict',409);
 return {status:200,body:{ok:true,leave_id:outcome.body.leave_id,revision:next,force_pull:true}};
}
