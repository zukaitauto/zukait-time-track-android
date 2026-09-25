(function(){
'use strict';
function rows(){const q=window.zukaitV2?.queue;return q?.read?q.read():[]}
function snapshot(){
 const all=rows(),conflicts=all.filter(x=>x.syncState==='conflict'),superseded=all.filter(x=>x.syncState==='superseded');
 const byCode={};for(const x of conflicts){const k=String(x.syncError||'V2_EVENT_CONFLICT');byCode[k]=(byCode[k]||0)+1}
 return {
  count:conflicts.length,byCode,
  items:conflicts.map(x=>({eventId:x.eventId,type:x.type,entityId:x.entityId,actorId:x.actorId,deviceId:x.deviceId,syncError:x.syncError||'V2_EVENT_CONFLICT',conflictAt:x.conflictAt||null,clientTime:x.clientTime||null})),
  resolvedCount:superseded.length,
  resolved:superseded.map(x=>({eventId:x.eventId,type:x.type,entityId:x.entityId,actorId:x.actorId,deviceId:x.deviceId,syncError:x.syncError||'V2_EVENT_CONFLICT',conflictAt:x.conflictAt||null,supersededAt:x.supersededAt||null,supersededBy:x.supersededBy||null}))
 };
}
function hasConflicts(){return snapshot().count>0}
function resolve(eventId,replacement){
 const q=window.zukaitV2?.queue;if(!q?.supersedeConflict)throw new Error('V2 conflict resolution unavailable');
 return q.supersedeConflict(eventId,replacement);
}
window.zukaitV2=Object.assign(window.zukaitV2||{},{conflictVisibility:{snapshot,hasConflicts,resolve}});
})();