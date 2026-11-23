import assert from 'node:assert/strict';
import {isolatedConfig,preflight} from './reception-isolated-transport.mjs';
const env={ZUKAIT_RECEPTION_ISOLATED:'1',ZUKAIT_ACCEPTANCE_PROJECT_REF:'abcdefghijklmnopqrst',ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY:'sb_publishable_qa'};
for(const patch of [{ZUKAIT_RECEPTION_ISOLATED:''},{ZUKAIT_ACCEPTANCE_PROJECT_REF:'pjknotnjkufadqavcmii'},{ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY:'sb_secret_qa'},{ZUKAIT_ACCEPTANCE_PROJECT_REF:'https://test.invalid'}]) assert.throws(()=>isolatedConfig({...env,...patch}));
const config=isolatedConfig(env),fixtures=['manager','supervisor','reception','employee'].map(name=>({name,id:'ZQA_RC_abcdef_'+name,token:'qa-'+name}));
const calls=[];
const transport=async(url,options)=>{
  assert.ok(url.startsWith(config.root+'/'));calls.push({url,options});
  if(options.method==='OPTIONS')return new Response(null,{status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,content-type,x-zukait-session'}});
  if(options.headers.apikey!==config.key)return new Response('{}',{status:401});
  if(url.includes('/rest/v1/'))return new Response('{}',{status:403});
  const body=JSON.parse(options.body),command=body.command, token=options.headers['x-zukait-session'];
  if(url.endsWith('/staff-auth')){assert.equal(body.action,'session');const name=body.session_token.replace('qa-','');const roles={manager:'Manager',supervisor:'Supervisor',reception:'Receptionist',employee:'Employee'};return Response.json({ok:true,user:{id:fixtures.find(f=>f.name===name).id,role:roles[name]}});}
  if(!token)return new Response('{}',{status:401});
  if(body.action==='receptionist_delivery_list')return Response.json({ok:true,rows:[]});
  if(['load','revision'].includes(body.action)||command?.operation==='STAFF')return new Response('{}',{status:403});
  if(Array.isArray(command))return new Response('{}',{status:400});
  assert.ok(['CAPABILITIES','LIST'].includes(command.operation),'Preflight must not send mutation commands');
  if(command.operation==='LIST'&&token==='qa-employee')return new Response('{}',{status:403});
  return Response.json({ok:true,allowed:token!=='qa-employee',rows:[]});
};
const result=await preflight(config,fixtures,transport);
assert.equal(result.transport_preflight,'PASS');assert.equal(result.mutating_flow,'NOT_RUN');assert.equal(result.physical_devices,'NOT_RUN');
assert.equal(calls.length,23);assert.equal(result.receptionist_read_authorization,'PASS');
// The isolated V305 backend uses this fixed synthetic namespace.
const originals=fixtures.map(f=>f.id);
fixtures.forEach(f=>{f.id='ZQA_RC_V305_'+f.name.toUpperCase();});
assert.equal((await preflight(config,fixtures,transport)).transport_preflight,'PASS');
for(const invalid of ['REAL_MANAGER','ZQA_RC_V305_EMPLOYEE','ZQA_RC_OTHER_MANAGER']){
 const wrong=fixtures.map(f=>({...f}));wrong[0].id=invalid;
 await assert.rejects(preflight(config,wrong,transport),/Dedicated QA identity/);
}
fixtures.forEach((f,i)=>{f.id=originals[i];});
await assert.rejects(preflight(config,[...fixtures,fixtures[0]],transport));
await assert.rejects(preflight(config,fixtures,async()=>new Response(null,{status:500})));
console.log('Isolated transport runner self-test passed: production/key rejection, mismatched key denial for both Edge Functions, exact target, read-only commands, CORS/auth/direct-access checks and honest evidence labels. No real backend contacted.');
