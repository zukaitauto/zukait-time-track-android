const norm=v=>String(v??'').trim().toUpperCase();
export function subletTransition(current,user,command,at=Date.now()){
 const editing=command?.action==='sublet_edit';
 if(!(editing?['Manager','Supervisor']:['Manager','Purchaser']).includes(user?.role))return {ok:false,code:'sublet_forbidden'};
 const allowed=editing?['action','id','entryId','expectedRevision','date','description','amount']:['action','id','jobCard','date','description','amount'];
 if(!command||Object.keys(command).some(k=>!allowed.includes(k)))return {ok:false,code:'sublet_invalid'};
 const id=String(command.id||''),date=String(command.date||''),description=String(command.description||'').trim(),raw=String(command.amount??'');
 const parsed=new Date(date+'T00:00:00Z'),amount=Number(raw);
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||!description||description.length>500||!/^\d+(?:\.\d{1,3})?$/.test(raw)||!Number.isFinite(amount)||amount<=0||amount>1000000)return {ok:false,code:'sublet_invalid'};
 if(date>new Date(at+4*3600000).toISOString().slice(0,10))return {ok:false,code:'sublet_future_date'};
 const entries=current.sublets||[],mills=Math.round(amount*1000);
 if(editing){
  const prior=(current.subletAudit||[]).find(x=>x.id===id);
  if(prior){if(prior.entryId!==command.entryId||prior.by!==user.id||prior.after.date!==date||prior.after.description!==description||prior.after.amountMills!==mills)return {ok:false,code:'sublet_id_conflict'};return {ok:true,data:current,entry:entries.find(x=>x.id===command.entryId),duplicate:true};}
  const before=entries.find(x=>x.id===command.entryId);if(!before)return {ok:false,code:'sublet_not_found'};
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision!==Number(before.revision||1))return {ok:false,code:'sublet_edit_conflict'};
  const after={...before,date,description,amountMills:mills,revision:Number(before.revision||1)+1,correctedBy:String(user.id),correctedAt:at};
  return {ok:true,entry:after,data:{...current,sublets:entries.map(x=>x.id===before.id?after:x),subletAudit:[...(current.subletAudit||[]),{id,entryId:before.id,jobCard:before.jobCard,before:{date:before.date,description:before.description,amountMills:before.amountMills},after:{date,description,amountMills:mills},by:String(user.id),at}]}};
 }
 const jobCard=norm(command.jobCard),job=(current.jobs||[]).find(j=>j&&norm(j.no)===jobCard&&!j.deleted&&!j.cancelled&&!j.archived&&norm(j.no)!=='ID001');
 if(!job)return {ok:false,code:'sublet_job_not_found'};
 const old=entries.find(x=>x.id===id);
 if(old){if(old.jobCard!==jobCard||old.date!==date||old.description!==description||old.amountMills!==mills||old.createdBy!==user.id)return {ok:false,code:'sublet_id_conflict'};return {ok:true,data:current,entry:old,duplicate:true};}
 const entry={id,jobCard,date,description,amountMills:mills,createdBy:String(user.id),createdAt:at,revision:1};
 return {ok:true,data:{...current,sublets:[...entries,entry]},entry};
}
export function subletTotal(rows,no){return (rows||[]).filter(x=>x&&norm(x.jobCard)===norm(no)).reduce((n,x)=>n+(Number.isSafeInteger(x.amountMills)&&x.amountMills>0?x.amountMills:0),0)/1000;}
