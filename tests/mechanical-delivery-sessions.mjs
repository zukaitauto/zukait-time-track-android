// Disposable fixtures only. Exercise actual SQL authorization and lock ordering.
import assert from 'node:assert/strict';
export async function waitForSessionLock(db,waiter,holder,label){
 for(let i=0;i<200;i++){
  if((await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter.processID,holder.processID])).rows[0].blocked)return;
  await new Promise(r=>setTimeout(r,20));
 }
 assert.fail('Expected '+label+' lock contention');
}
export async function deliveryAuthorizationChecks({db,call,request,actor,sessionHash,preview,capture}){
 const baseline=await capture(),credential=(await db.query('select role,active from staff_credentials where user_id=$1',[actor.id])).rows[0],caps=(await db.query('select capabilities from zukait_mechanical.settings where singleton')).rows[0].capabilities;
 const cases=[
  {name:'revoked session',deny:()=>db.query('update staff_sessions set revoked_at=now() where token_hash=$1',[sessionHash]),restore:()=>db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]),code:/mechanical_invalid_session/,status:401},
  {name:'inactive account',deny:()=>db.query('update staff_credentials set active=false where user_id=$1',[actor.id]),restore:()=>db.query('update staff_credentials set active=$2 where user_id=$1',[actor.id,credential.active]),code:/mechanical_forbidden/,status:403},
  {name:'changed role',deny:()=>db.query("update staff_credentials set role='Manager' where user_id=$1",[actor.id]),restore:()=>db.query('update staff_credentials set role=$2 where user_id=$1',[actor.id,credential.role]),code:/mechanical_forbidden/,status:403},
  {name:'removed delivery capability',deny:()=>db.query("update zukait_mechanical.settings set capabilities=jsonb_set(capabilities,array[$1],coalesce(capabilities->$1,'[]')-'MECHANICAL_DELIVER') where singleton",[actor.id]),restore:()=>db.query('update zukait_mechanical.settings set capabilities=$1::jsonb where singleton',[JSON.stringify(caps)]),code:/mechanical_forbidden/,status:403}
 ];
 for(const test of cases){await test.deny();try{
  await assert.rejects(call(request),test.code,test.name+' cannot commit or replay a receipt');
  assert.equal((await preview()).status,test.status,test.name+' cannot obtain delivery preview');
  assert.equal(await capture(),baseline,test.name+' changes no business data, revisions, receipt, audit or history');
 }finally{await test.restore()}}
}
export async function deliveryRevocationFirstChecks({db,pg,config,database,sql,values,request,actor,sessionHash,capture}){
 const a=new pg.Client({...config,database}),b=new pg.Client({...config,database});await Promise.all([a.connect(),b.connect()]);await a.query('set role service_role');
 const baseline=await capture(),credential=(await db.query('select role,active from staff_credentials where user_id=$1',[actor.id])).rows[0];
 const cases=[
  {name:'session revocation',sql:'update staff_sessions set revoked_at=now() where token_hash=$1',args:[sessionHash],restore:()=>db.query('update staff_sessions set revoked_at=null where token_hash=$1',[sessionHash]),code:/mechanical_invalid_session/},
  {name:'account deactivation',sql:'update staff_credentials set active=false where user_id=$1',args:[actor.id],restore:()=>db.query('update staff_credentials set active=$2 where user_id=$1',[actor.id,credential.active]),code:/mechanical_forbidden/},
  {name:'role change',sql:"update staff_credentials set role='Manager' where user_id=$1",args:[actor.id],restore:()=>db.query('update staff_credentials set role=$2 where user_id=$1',[actor.id,credential.role]),code:/mechanical_forbidden/}
 ];
 try{for(const test of cases){try{
  await b.query('begin');await b.query(test.sql,test.args);
  const waiting=a.query(sql,values(request)).then(result=>({result}),error=>({error}));
  await waitForSessionLock(db,a,b,test.name);await b.query('commit');
  const denied=await waiting;assert.ok(denied.error,test.name+' that wins must deny fresh delivery');assert.match(denied.error.message,test.code);
  assert.equal(await capture(),baseline,test.name+' leaves no delivery, receipt, history or revision');
 }finally{await Promise.all([a.query('rollback'),b.query('rollback')]);await test.restore()}}}
 finally{await Promise.all([a.end(),b.end()])}
}
