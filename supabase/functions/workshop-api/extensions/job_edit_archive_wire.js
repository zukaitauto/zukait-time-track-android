// Legacy client view. Never modify the authoritative compact snapshot.
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
export async function jobEditWireState(state,compact,prefixReader){
 if(state==null||!own(state,'jobEditArchive'))return state;
 const marker=state.jobEditArchive;
 if(!marker||!Number.isSafeInteger(marker.snapshotRevision)||marker.snapshotRevision<0||
    !Number.isSafeInteger(marker.prefixCount)||marker.prefixCount<1||!Array.isArray(state.jobEdits))
   throw Error('audit_history_unavailable');
 if(compact===true)return state;
 const result=await prefixReader(marker.snapshotRevision,marker.prefixCount);
 if(!result?.ok||result.snapshotRevision!==marker.snapshotRevision||result.prefixCount!==marker.prefixCount||
    !Array.isArray(result.entries)||result.entries.length!==marker.prefixCount)
   throw Error('audit_history_unavailable');
 const {jobEditArchive:discarded,...rest}=state;
 return {...rest,jobEdits:[...result.entries,...state.jobEdits]};
}
// Cache only within one request. Immutable prefix identity includes both fields.
export function requestArchivePrefixReader(fetchPrefix){
 const pending=new Map();
 return (revision,count)=>{
  const key=revision+':'+count;
  if(!pending.has(key))pending.set(key,Promise.resolve().then(()=>fetchPrefix(revision,count)));
  return pending.get(key);
 };
}

// Explicit capability negotiation. A server flag may stop new compact loads;
// already-compact saves still acknowledge in the submitted representation so
// a concurrent local mutation cannot merge a full prefix into the live tail.
export const COMPACT_JOB_EDIT_MODE='compact-v1';
export const LEGACY_JOB_EDIT_MODE='legacy-v1';
export function jobEditLoadMode(request,enabled){
 return enabled===true&&request?.job_edit_sync_mode===COMPACT_JOB_EDIT_MODE?COMPACT_JOB_EDIT_MODE:LEGACY_JOB_EDIT_MODE;
}
export function jobEditKnownModeMatches(request,mode){
 if(request?.job_edit_sync_mode!==COMPACT_JOB_EDIT_MODE)return mode===LEGACY_JOB_EDIT_MODE;
 return request.known_job_edit_sync_mode===mode;
}
export function jobEditSaveMode(request){
 return request?.job_edit_sync_mode===COMPACT_JOB_EDIT_MODE&&request.data!=null&&own(request.data,'jobEditArchive')?COMPACT_JOB_EDIT_MODE:LEGACY_JOB_EDIT_MODE;
}
