// Inactive candidate. No tokens or raw material/customer records are persisted.
// Caller supplies the existing verified Accountant session and transport.
export function billIntents({storage,project,session,online,send}) {
 const identity=()=>{const s=session();if(!s||!s.verified||!['Accountant','Manager'].includes(s.role)||!s.id||!s.sessionId)throw Error('bill_session_required');return s;};
 const key=s=>'zukait_bill_intent_v1:'+encodeURIComponent(project)+':'+encodeURIComponent(s.id);
 const read=s=>{const raw=storage.getItem(key(s));if(raw===null)return null;let p;try{p=JSON.parse(raw)}catch{throw Error('bill_pending_corrupt')}
  if(p?.version!==1||p.actor!==s.id||p.project!==project||p.body?.action!=='accountant_bill_post'||!p.body.command?.requestId)throw Error('bill_pending_corrupt');return {raw,p};};
 let busy=false;
 async function submit(command,{retry=false}={}) {
  if(busy)throw Error('bill_busy');const s=identity();if(!online())throw Error('bill_online_required');busy=true;
  try {
   let pending=read(s);
   if(retry){if(!pending)throw Error('bill_no_pending');}
   else {
    if(pending)throw Error('bill_pending_exists');
    // Serialize before the first await; callers cannot mutate a stored request.
    const raw=JSON.stringify({version:1,actor:s.id,project,body:{action:'accountant_bill_post',command}});
    const parsed=JSON.parse(raw);if(!parsed.body.command?.requestId||!parsed.body.command?.entityId)throw Error('bill_invalid_intent');
    storage.setItem(key(s),raw);if(storage.getItem(key(s))!==raw)throw Error('bill_storage_unavailable');pending={raw,p:parsed};
   }
   const sameSession=()=>{const now=identity();if(now.id!==s.id||now.role!==s.role||now.sessionId!==s.sessionId)throw Error('bill_account_changed');};
   sameSession();if(!online())throw Error('bill_online_required');
   const response=await send(JSON.parse(pending.raw).body);
   sameSession();
   // Never clear on timeout, rejection, or an ambiguous/non-success response.
   if(response?.ok!==true)throw Error(response?.code||'bill_confirmation_unknown');
   if(storage.getItem(key(s))!==pending.raw)throw Error('bill_pending_changed');
   storage.removeItem(key(s));return response;
  } finally {busy=false;}
 }
 return {submit,retry:()=>submit(null,{retry:true}),pending:()=>read(identity())?.p.body??null};
}
