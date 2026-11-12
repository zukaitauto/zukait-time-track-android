// Only concurrent reads can share a load. No completed snapshot cache or TTL.
// Every eligible request first checks the actor and primary PostgreSQL MVCC view.
// Financial commands never use this path. Missing/failed probes fail closed when enabled.
function immutable(value){
 const pending=[value],seen=new WeakSet();
 while(pending.length){const x=pending.pop();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);for(const v of Object.values(x))if(v&&typeof v==='object')pending.push(v);Object.freeze(x)}
 return value;
}
export function createAccountantContextReader({maxInFlight=8}={}){
 const active=new Map();
 const load=async(admin,user)=>{const r=await admin.rpc('zukait_accountant_context',{p_actor_id:user.id});if(r.error)throw r.error;return r.data};
 return async function readContext(admin,user,{enabled=false,project='',readOnly=false}={}){
  if(!enabled||!readOnly)return load(admin,user);
  if(!project||!user?.id||!['Manager','Accountant'].includes(user.role))throw Error('accountant_context_scope_invalid');
  const r=await admin.rpc('zukait_accountant_read_snapshot',{p_actor_id:user.id});if(r.error)throw r.error;
  const v=r.data;
  if(!v||v.actor_id!==user.id||v.role!==user.role||typeof v.database!=='string'||!/^\d+$/.test(v.database)||typeof v.snapshot!=='string'||!/^\d+:\d+:[\d,]*$/.test(v.snapshot))throw Error('accountant_context_snapshot_invalid');
  const key=JSON.stringify([project,v.database,user.id,user.role,v.snapshot]);
  if(active.has(key))return active.get(key);
  if(active.size>=maxInFlight)return load(admin,user);
  // The DB promise is installed before callers can join it. Remove it as soon as
  // it settles, including failures; later requests must load a fresh context.
  const pending=load(admin,user).then(immutable);
  active.set(key,pending);
  try{return await pending}finally{if(active.get(key)===pending)active.delete(key)}
 };
}
