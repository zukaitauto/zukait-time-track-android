const norm=v=>String(v??'').trim().toUpperCase();
export function subletTransition(current,user,command,at=Date.now()){
 if(!['Manager','Purchaser'].includes(user?.role))return {ok:false,code:'sublet_forbidden'};
 const allowed=['action','id','jobCard','date','description','amount'];
 if(!command||Object.keys(command).some(k=>!allowed.includes(k)))return {ok:false,code:'sublet_invalid'};
 const id=String(command.id||''),jobCard=norm(command.jobCard),date=String(command.date||''),description=String(command.description||'').trim(),raw=String(command.amount??'');
 const parsed=new Date(date+'T00:00:00Z'),amount=Number(raw);
 if(!/^[a-zA-Z0-9_-]{10,100}$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||!description||description.length>500||!/^\d+(?:\.\d{1,3})?$/.test(raw)||!Number.isFinite(amount)||amount<=0||amount>1000000)return {ok:false,code:'sublet_invalid'};
 if(date>new Date(at+4*3600000).toISOString().slice(0,10))return {ok:false,code:'sublet_future_date'};
 const job=(current.jobs||[]).find(j=>j&&norm(j.no)===jobCard&&!j.deleted&&!j.cancelled&&!j.archived&&norm(j.no)!=='ID001');
 if(!job)return {ok:false,code:'sublet_job_not_found'};
 const entries=current.sublets||[],old=entries.find(x=>x.id===id),mills=Math.round(amount*1000);
 if(old){if(old.jobCard!==jobCard||old.date!==date||old.description!==description||old.amountMills!==mills||old.createdBy!==user.id)return {ok:false,code:'sublet_id_conflict'};return {ok:true,data:current,entry:old,duplicate:true};}
 const entry={id,jobCard,date,description,amountMills:mills,createdBy:String(user.id),createdAt:at};
 return {ok:true,data:{...current,sublets:[...entries,entry]},entry};
}
export function subletTotal(rows,no){return (rows||[]).filter(x=>x&&norm(x.jobCard)===norm(no)).reduce((n,x)=>n+(Number.isSafeInteger(x.amountMills)&&x.amountMills>0?x.amountMills:0),0)/1000;}
