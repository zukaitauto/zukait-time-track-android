(function(){
  const V2=window.zukaitV2=window.zukaitV2||{};
  const repeat=V2.repeat=V2.repeat||{};

  repeat.validate=function(input,ctx){
    const x=input||{}, c=ctx||{};
    const originals=(c.assignments||[]).filter(a=>a&&a.job===x.job&&!a.rework&&!a.cancelled);
    if(!x.job) return {ok:false,code:'JOB_REQUIRED'};
    if(!originals.length) return {ok:false,code:'ORIGINAL_REQUIRED'};
    if(originals.some(a=>!a.completed)) return {ok:false,code:'ORIGINAL_NOT_FINISHED'};
    if((c.assignments||[]).some(a=>a&&a.job===x.job&&a.rework&&!a.completed&&!a.cancelled))
      return {ok:false,code:'REPEAT_ALREADY_OPEN'};
    if(!x.employeeId) return {ok:false,code:'EMPLOYEE_REQUIRED'};
    if(!x.mistakeEmployeeId) return {ok:false,code:'MISTAKE_EMPLOYEE_REQUIRED'};
    const mins=Number(x.suggestedMinutes);
    if(!Number.isFinite(mins)||mins<1) return {ok:false,code:'TIME_REQUIRED'};
    if(!String(x.reason||'').trim()) return {ok:false,code:'REASON_REQUIRED'};
    return {ok:true};
  };

  repeat.buildAssignment=function(input,meta){
    const x=input||{}, m=meta||{};
    const check=repeat.validate(x,m);
    if(!check.ok) return check;
    const at=Number(m.at||Date.now());
    const id=String(m.id||('repeat-'+at));
    return {ok:true,assignment:{
      id,job:String(x.job),emp:String(x.employeeId),suggested:Number(x.suggestedMinutes),
      completed:false,rework:true,repeatReason:String(x.reason).trim(),
      mistakeEmp:String(x.mistakeEmployeeId),assignedBy:String(m.actorId||''),
      assignedAt:at,repeatSameEmployee:String(x.employeeId)===String(x.mistakeEmployeeId)
    },audit:{
      id:String(m.auditId||('repeat-audit-'+at)),assignmentId:id,job:String(x.job),
      emp:String(x.employeeId),mistakeEmp:String(x.mistakeEmployeeId),
      suggested:Number(x.suggestedMinutes),reason:String(x.reason).trim(),
      by:String(m.actorId||''),at
    }};
  };

  repeat.incentiveDeductionMinutes=function(assignments,employeeId){
    return (assignments||[]).filter(a=>a&&a.rework&&!a.cancelled&&String(a.mistakeEmp)===String(employeeId))
      .reduce((n,a)=>n+Math.max(0,Number(a.actualMinutes!=null?a.actualMinutes:a.suggested)||0),0);
  };
})();
