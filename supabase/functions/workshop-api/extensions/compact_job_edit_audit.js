// Pure compatibility boundary. Authoritative current order is never replaced.
// Compare the submitted audit with the exact revision the client edited.
// Preserve independent duplicate occurrences; ambiguous concurrent replay fails closed.
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function canonical(v){
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 return JSON.stringify(v);
}
const fail=code=>({ok:false,code});
const markerValid=m=>object(m)&&Number.isSafeInteger(m.snapshotRevision)&&m.snapshotRevision>=0&&Number.isSafeInteger(m.prefixCount)&&m.prefixCount>0;
function additions(base,changed){
 const counts=new Map();
 for(const entry of base){const k=canonical(entry);counts.set(k,(counts.get(k)||0)+1);}
 const extra=[];
 for(const entry of changed){const k=canonical(entry),n=counts.get(k)||0;if(n>0)counts.set(k,n-1);else extra.push(entry);}
 return [...counts.values()].some(n=>n>0)?null:extra;
}
export function reconcileCompactJobEditAudit({base,current,proposed,expandedCurrent}){
 if(!object(base)||!object(current)||!object(proposed))return fail('audit_refresh_required');
 if(!own(current,'jobEditArchive'))return {ok:true,active:false};
 const marker=current.jobEditArchive;
 if(!markerValid(marker)||!Array.isArray(current.jobEdits)||!Array.isArray(base.jobEdits)||!Array.isArray(proposed.jobEdits))return fail('audit_history_unavailable');
 const compactBase=own(base,'jobEditArchive');
 if(compactBase&&canonical(base.jobEditArchive)!==canonical(marker))return fail('audit_refresh_required');
 if(own(proposed,'jobEditArchive')!==compactBase||compactBase&&canonical(proposed.jobEditArchive)!==canonical(marker))return fail('audit_refresh_required');
 let authoritative=current.jobEdits;
 if(!compactBase){
  if(!Array.isArray(expandedCurrent)||expandedCurrent.length!==marker.prefixCount+current.jobEdits.length||
     canonical(expandedCurrent.slice(marker.prefixCount))!==canonical(current.jobEdits))return fail('audit_history_unavailable');
  authoritative=expandedCurrent;
 }
 const localAdds=additions(base.jobEdits,proposed.jobEdits);
 const remoteAdds=additions(base.jobEdits,authoritative);
 if(!localAdds||!remoteAdds)return fail('audit_refresh_required');
 // Never silently drop a duplicate whose origin is ambiguous. Require retry
 // resolution with the original pending change preserved by the client.
 const remoteKeys=new Set(remoteAdds.map(canonical));
 if(localAdds.some(entry=>remoteKeys.has(canonical(entry))))return fail('audit_replay_ambiguous');
 return {ok:true,active:true,marker:structuredClone(marker),jobEdits:[...structuredClone(current.jobEdits),...structuredClone(localAdds)]};
}
