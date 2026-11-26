// Candidate-only pure comparison for selective live-status writes.
// The authoritative global revision remains in the API response, not a reason
// to rewrite every employee's otherwise unchanged status row.
const fields=['employee_id','employee_name','department','status','job_no','assignment_id','session_id','session_start','suggested_minutes','vehicle','registration','overtime'];
const normalize=(r)=>Object.fromEntries(fields.map(k=>[k,k==='suggested_minutes'?Number(r?.[k]||0):k==='overtime'?r?.[k]===true:k==='session_start'?(r?.[k]==null?null:Number(r[k])):String(r?.[k]??'')]));
export function liveStatusDiff(current,expected){
  if(!Array.isArray(current)||!Array.isArray(expected))throw Error('live_status_invalid_rows');
  const old=new Map();
  for(const row of current){const id=String(row?.employee_id||'');if(!id||old.has(id))throw Error('live_status_duplicate_current');old.set(id,row);}
  const seen=new Set(),changed=[];
  for(const row of expected){
    const id=String(row?.employee_id||'');
    if(!id||seen.has(id))throw Error('live_status_duplicate_expected');
    seen.add(id);
    if(!old.has(id)||JSON.stringify(normalize(old.get(id)))!==JSON.stringify(normalize(row)))changed.push(row);
  }
  return {changed,removed:[...old.keys()].filter(id=>!seen.has(id))};
}
