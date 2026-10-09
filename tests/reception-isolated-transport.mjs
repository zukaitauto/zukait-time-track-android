// Read-only Reception preflight over real HTTPS. Does not exercise mutations or devices.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

export function isolatedConfig(env) {
  const ref=env.ZUKAIT_ACCEPTANCE_PROJECT_REF, key=env.ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY;
  assert.equal(env.ZUKAIT_RECEPTION_ISOLATED,'1','Explicit isolated acceptance opt-in required');
  assert.ok(/^[a-z]{20}$/.test(ref||'') && ref!=='pjknotnjkufadqavcmii','Non-production project required');
  assert.ok(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key||'') && key!=='sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A','Isolated publishable key required');
  return {root:`https://${ref}.supabase.co`,key};
}

export async function preflight(config, fixtures, transport=fetch) {
  const ref=new URL(config.root).hostname.split('.')[0];
  assert.deepEqual(config,isolatedConfig({ZUKAIT_RECEPTION_ISOLATED:'1',ZUKAIT_ACCEPTANCE_PROJECT_REF:ref,ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY:config.key}),'Exact isolated HTTPS target required');
  assert.ok(Array.isArray(fixtures),'QA fixture array required');
  const names=['manager','supervisor','reception','employee'];
  assert.equal(fixtures.length,names.length,'Exactly four dedicated QA identities required');
  const actors=Object.fromEntries(fixtures.map(f=>[f.name,f]));
  for(const name of names) {
    const f=actors[name];
    assert.ok(f && new RegExp(`^ZQA_RC_[a-f0-9]+_${name}$`).test(f.id) && typeof f.token==='string' && f.token.length>0,'Dedicated QA identity/session required: '+name);
  }
  const endpoint=config.root+'/functions/v1/workshop-api';
  const request=async(name,command,extra={})=>transport(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,'x-zukait-session':actors[name]?.token||''},
    body:JSON.stringify({action:'reception',command,...extra}),signal:AbortSignal.timeout(30000),
  });
  const options=await transport(endpoint,{method:'OPTIONS',headers:{Origin:'https://acceptance.invalid','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type,x-zukait-session'},signal:AbortSignal.timeout(30000)});
  assert.equal(options.status,200,'Edge CORS preflight failed');
  assert.equal(options.headers.get('access-control-allow-origin'),'*');
  assert.ok(options.headers.get('access-control-allow-headers')?.includes('x-zukait-session'));
  for(const name of names) {
    const res=await request(name,{operation:'CAPABILITIES'});
    assert.equal(res.status,200,name+' session failed');
    const body=await res.json();assert.equal(body.ok,true);assert.equal(body.allowed,name!=='employee');
  }
  for(const name of names.slice(0,3)) {
    const res=await request(name,{operation:'LIST',filter:'ALL'});
    assert.equal(res.status,200);assert.ok(Array.isArray((await res.json()).rows));
  }
  const spoof=await request('employee',{operation:'LIST'},{p_actor_id:actors.manager.id,user:{id:actors.manager.id,role:'Manager'}});
  assert.equal(spoof.status,403,'Actor spoofing must be rejected');
  assert.equal((await request('guest',{operation:'CAPABILITIES'})).status,401);
  assert.equal((await request('manager',[])).status,400);
  for(const suffix of ['/rest/v1/workshop_receptions?select=rc_no&limit=1','/rest/v1/rpc/zukait_reception_command']) {
    const rpc=suffix.includes('/rpc/');
    const res=await transport(config.root+suffix,{method:rpc?'POST':'GET',headers:{apikey:config.key,'Content-Type':'application/json'},...(rpc?{body:JSON.stringify({p_actor_id:actors.manager.id,p_command:{operation:'LIST'}})}:{}),signal:AbortSignal.timeout(30000)});
    assert.ok([401,403,404].includes(res.status),'Direct unauthenticated Reception access must be denied');
  }
  return {project_ref:new URL(config.root).hostname.split('.')[0],transport_preflight:'PASS',mutating_flow:'NOT_RUN',physical_devices:'NOT_RUN'};
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const config=isolatedConfig(process.env);
  assert.ok(process.env.ZUKAIT_RECEPTION_QA_FIXTURES,'Protected isolated QA session file required');
  const fixtures=JSON.parse(fs.readFileSync(process.env.ZUKAIT_RECEPTION_QA_FIXTURES,'utf8'));
  console.log(JSON.stringify(await preflight(config,fixtures),null,2));
}
