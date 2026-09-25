(function(){
'use strict';
function snapshot(){
 const q=window.zukaitV2?.queue;const rows=q?.conflicts?q.conflicts():[];
 const byCode={};for(const x of rows){const k=String(x.syncError||'V2_EVENT_CONFLICT');byCode[k]=(byCode[k]||0)+1}
 return {count:rows.length,byCode,items:rows.map(x=>({eventId:x.eventId,type:x.type,entityId:x.entityId,actorId:x.actorId,deviceId:x.deviceId,syncError:x.syncError||'V2_EVENT_CONFLICT',conflictAt:x.conflictAt||null,clientTime:x.clientTime||null}))};
}
function hasConflicts(){return snapshot().count>0}
window.zukaitV2=Object.assign(window.zukaitV2||{},{conflictVisibility:{snapshot,hasConflicts}});
})();