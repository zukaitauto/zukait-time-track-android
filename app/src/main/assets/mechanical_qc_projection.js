// In-memory server snapshot only. No timers, polling, storage or queued writes.
export function createMechanicalQcProjection(options){
 const identity=()=>JSON.stringify(options.getSession?.()),enabled=()=>options.enabled?.()===true;
 let value=null,owner=null,revision=null,generation=0,inFlight=null,attempted=null;
 function current(){if(!enabled()||owner!==identity())return null;const now=options.getRevision?.();return now===revision||now===value?.workshopRevision?value:null}
 function invalidate(){value=null;generation++}
 async function refresh(){
  if(!enabled())return null;const who=identity(),session=options.getSession(),seq=generation;
  if(inFlight?.owner===who&&inFlight.seq===seq)return inFlight.promise;
  attempted=who;value=null;
  const work={owner:who,seq,promise:null},startRevision=options.getRevision?.();inFlight=work;
  work.promise=(async()=>{
   const result=await options.read();if(!enabled()||identity()!==who||generation!==seq)return null;
   if(result?.ok!==true)throw Error(result?.code||'mechanical_unavailable');
   if(result.actorId!==session.id||result.actorRole!==session.role||!Array.isArray(result.rows)||result.rows.length>1000||!result.counts||!Number.isSafeInteger(result.workshopRevision)||!Number.isSafeInteger(result.recordsRevision))throw Error('invalid_qc_overview');
   const now=options.getRevision?.();if(now!==startRevision&&now!==result.workshopRevision)return null;
   value=result;owner=who;revision=now;return value;
  })();
  try{return await work.promise}finally{if(inFlight===work)inFlight=null}
 }
 function initial(){return attempted===identity()?Promise.resolve(current()):refresh()}
 return {current,refresh,initial,invalidate};
}
