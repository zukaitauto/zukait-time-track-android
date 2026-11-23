(function(){
'use strict';
const KEY='zukait_v2_reconnect_audit_v1';
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch(_){return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-500)))}catch(_){}return rows}
function record(local,server,legacyOutcome){
 try{
  const api=window.zukaitV2?.reconnect;if(!api)return null;
  const decision=api.decide(local,server),row={at:new Date().toISOString(),assignmentId:String(local?.assignmentId||local?.id||server?.assignmentId||server?.id||''),employeeId:String(local?.emp||local?.employeeId||server?.emp||server?.employeeId||''),decision,legacyOutcome:legacyOutcome||null,localRevision:Number(local?.serverRevision||0),serverRevision:Number(server?.serverRevision??server?.revision??0)};
  const rows=read();rows.push(row);write(rows);return row;
 }catch(e){console.warn('V2 reconnect audit skipped',e);return null}
}
function summary(){const rows=read();return rows.reduce((a,r)=>{const k=r.decision?.action||'UNKNOWN';a[k]=(a[k]||0)+1;return a},{})}
window.zukaitV2=Object.assign(window.zukaitV2||{},{reconnectAudit:{record,read,summary}});
})();
