(function(){
  'use strict';
  const TYPES=Object.freeze({START:'WORK_START',PAUSE:'WORK_PAUSE',RESUME:'WORK_RESUME',FINISH:'WORK_FINISH',ID001_START:'ID001_START',ID001_STOP:'ID001_STOP'});
  function create(type,assignment,context={}){
    const api=window.zukaitV2?.event;if(!api)throw new Error('V2 event contract not loaded');
    const entityId=assignment?.id||context.assignmentId||'';
    return api.envelope(type,entityId,{job:String(assignment?.job||context.job||''),jobCard:String(assignment?.job||context.job||''),employeeId:String(assignment?.emp||context.employeeId||''),assignmentId:String(entityId),suggestedMinutes:Math.max(0,Number(assignment?.suggestedMinutes??assignment?.mins??context.suggestedMinutes??0)),repeat:!!(assignment?.rework||context.repeat),repeatMinutes:Math.max(0,Number(context.repeatMinutes??0))},context);
  }
  function record(type,assignment,context={}){
    const event=create(type,assignment,context),q=window.zukaitV2?.queue;if(!q)throw new Error('V2 queue not loaded');q.enqueue(event);return event;
  }
  window.zukaitV2=Object.assign(window.zukaitV2||{},{work:{TYPES,create,record}});
})();
