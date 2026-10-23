// Public numbers can change; stored work, events and append-only accounting keys cannot.
const key=v=>String(v??'').trim().toUpperCase();
const references=new Set(['job','jobCard','job_card','job_no','jobNo','jobCardNo','job_card_no','jobNumber','job_number','preliminaryLinkedJob','preliminarySourceJob','sourceJob','source_job','previousJob','nextJob','previous_job','next_job']);
const dictionaries=new Set(['paintCosting','managerReviews']);
export function jobNumberCodec(rows=[]){
 const input=new Map(),output=new Map();
 for(const r of rows){input.set(key(r.number),r.stable_job);output.set(key(r.stable_job),r.current_number);}
 const ref=(v,map)=>typeof v==='string'||typeof v==='number'?(map.get(key(v))??v):v;
 function walk(v,map,parent=''){
  if(Array.isArray(v))return v.map(x=>walk(x,map,parent));
  if(!v||typeof v!=='object')return v;
  const jobObject=['jobs','job','expectedJob','linked_job'].includes(parent)||('no' in v&&['jobType','make','reg','receptionNo'].some(k=>k in v));
  return Object.fromEntries(Object.entries(v).map(([k,value])=>[
   dictionaries.has(parent)?String(ref(k,map)):k,
   references.has(k)||k==='no'&&jobObject||['entityId','entity_id'].includes(k)&&/^JOB_/.test(String(v.eventType||v.event_type||''))?walk(ref(value,map),map,k):walk(value,map,k)
  ]));
 }
 return {
  toInternal:value=>walk(value,input),toPublic:value=>walk(value,output),
  // Search/cursor identifiers are not free text fields in stored records.
  internalNumber:value=>ref(value,input),publicNumber:value=>ref(value,output)
 };
}
export function jobNumberChange(request){
 if(request.newJobNumber===undefined)return null;
 const number=String(request.newJobNumber).trim();
 if(!/^[1-9]\d{0,9}$/.test(number))return {ok:false,code:'job_number_invalid'};
 if(request.numberChangeConfirmed!==true||typeof request.expectedJobNumber!=='string')return {ok:false,code:'job_number_confirmation_required'};
 return {ok:true,number,expected:request.expectedJobNumber};
}
