// Production-shaped staff-auth login and role-workflow matrix; synthetic, isolated only.
// No requests to production, no real credentials or sessions.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {accountantApi} from '../supabase/functions/workshop-api/accountant/api.js';
import {mechanicalInspectionApi} from '../supabase/functions/workshop-api/extensions/mechanical_inspection_api.js';

const credentials=[],sessions=[];
let rpcCalls=0;
const admin={
  from(name){
    assert.ok(['staff_credentials','staff_sessions'].includes(name));
    const rows=name==='staff_credentials'?credentials:sessions;
    let filters=[],inFilters=[],mode='select',value,ascending=true,orderField='';
    const matching=()=>rows.filter(row=>filters.every(([k,v])=>v===null?row[k]==null:row[k]===v)&&inFilters.every(([k,vs])=>vs.includes(row[k])));
    const execute=()=>{
      if(mode==='insert') rows.push({...value});
      if(mode==='update') matching().forEach(row=>Object.assign(row,value));
      const data=mode==='select'?matching().slice().sort((a,b)=>orderField?String(a[orderField]??'').localeCompare(String(b[orderField]??''))*(ascending?1:-1):0):null;
      return {data,error:null};
    };
    const chain={
      select(){return chain;},
      eq(k,v){filters.push([k,v]);return chain;},
      is(k,v){filters.push([k,v]);return chain;},
      in(k,values){inFilters.push([k,values]);return chain;},
      order(k,options={}){orderField=k;ascending=options.ascending!==false;return chain;},
      insert(v){mode='insert';value=v;return chain;},
      update(v){mode='update';value=v;return chain;},
      async maybeSingle(){const x=execute();return {...x,data:x.data?.[0]||null};},
      then(resolve,reject){return Promise.resolve().then(execute).then(resolve,reject);}
    };
    return chain;
  },
  async rpc(name,params){
    if(name==='zukait_accountant_context')return {data:{
      state:{jobs:[],users:[],sessions:[],sublets:[],leaves:[],consumables:{actuals:[],issues:[]},paintPurchasing:{orders:[]}},
      events:[],entries:[],snapshot_revision:1,finance_revision:0
    },error:null};
    rpcCalls++;
    assert.equal(name,'zukait_manager_accountants');
    assert.equal(params.p_command.operation,'LIST');
    return {data:{ok:true,accounts:[]},error:null};
  }
};
let serve;
const runtime=vm.createContext({
  Deno:{env:{get(k){return k==='SUPABASE_PUBLISHABLE_KEY'?'QA-PUBLIC-KEY':k==='SUPABASE_SERVICE_ROLE_KEY'?'QA-ISOLATED-SERVER-SECRET':'';}},serve(fn){serve=fn;}},
  createClient:()=>admin,crypto:webcrypto,TextEncoder,Response,console,Date,btoa,atob,Uint8Array
});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/staff-auth/index.ts','utf8').replace(/^import[^\n]*\n/gm,'')),runtime);
const syntheticPassword='V401-synthetic-role-password';
const hashes=await vm.runInContext('passwordFields('+JSON.stringify(syntheticPassword)+')',runtime);
const identities=[
 ['QA-MGR','Manager','Management'],
 ['QA-SUP','Supervisor','Bodyshop'],
 ['SUP003','Mechanical Supervisor','Mechanic'],
 ['QA-RCP','Receptionist','Reception'],
 ['QA-ACC','Accountant','Accounts'],
 ['QA-EMP','Employee','Denter'],
 ['QA-BUY','Purchaser','Parts'],
 ['QA-OFF','Employee','Painter']
];
for(const [id,role,department] of identities)credentials.push({
  user_id:id,login_id:id,display_name:id,role,department,
  active:id!=='QA-OFF',must_change:id==='SUP003',failed_attempts:0,locked_until:null,...hashes
});
const call=async payload=>{
  const res=await serve(new Request('https://isolated.invalid/functions/v1/staff-auth',{
    method:'POST',headers:{apikey:'QA-PUBLIC-KEY','Content-Type':'application/json'},
    body:JSON.stringify(payload)
  }));
  return {status:res.status,body:await res.json()};
};
const tokens=new Map();
for(const [id,role,department] of identities){
  const r=await call({action:'login',user_id:id,password:syntheticPassword});
  if(id==='QA-OFF'){assert.equal(r.status,401,'inactive login is refused');continue;}
  assert.equal(r.status,200,id+' login');
  assert.equal(r.body.user.id,id);
  assert.equal(r.body.user.role,role);
  assert.equal(r.body.user.department,department);
  assert.ok(typeof r.body.session_token==='string'&&r.body.session_token.length>=30);
  assert.equal(JSON.stringify(r.body).includes('password_hash'),false);
  const sess=await call({action:'session',session_token:r.body.session_token});
  assert.equal(sess.status,id==='SUP003'?401:200,id+' initial session policy');
  if(id!=='SUP003')assert.equal(sess.body.user.role,role);
  tokens.set(id,r.body.session_token);
}
assert.equal(tokens.size,7);
// The live Mechanical Supervisor account requires first password change. Do not
// clear must_change in the database; prove the normal authenticated flow instead.
const mechanicalInitial=tokens.get('SUP003');
assert.equal((await call({action:'session',session_token:mechanicalInitial})).status,401,'temporary Mechanical Supervisor session denied until password change');
const mechChanged=await call({
 action:'change_password',user_id:'SUP003',
 current_password:syntheticPassword,new_password:'V401-mechanical-personal-password'
});
assert.equal(mechChanged.status,200,'Mechanical Supervisor must change their temporary password');
assert.equal(credentials.find(x=>x.user_id==='SUP003').must_change,false);
assert.equal((await call({action:'session',session_token:mechanicalInitial})).status,401,'old mechanical session revoked');
assert.equal((await call({action:'session',session_token:mechChanged.body.session_token})).status,200);
tokens.set('SUP003',mechChanged.body.session_token);
assert.equal((await call({action:'login',user_id:'SUP003',password:syntheticPassword})).status,401,'temporary mechanical password invalidated');
const mechRelogin=await call({action:'login',user_id:'SUP003',password:'V401-mechanical-personal-password'});
assert.equal(mechRelogin.status,200,'Mechanical Supervisor re-login with permanent password');
assert.equal(mechRelogin.body.must_change,false);
// A first-login requirement must apply to EVERY staff role, not only Accountant.
for(const [id,token] of tokens){
 const row=credentials.find(x=>x.user_id===id);
 row.must_change=true;
 assert.equal((await call({action:'session',session_token:token})).status,401,id+' must_change session denial');
 row.must_change=false;
 assert.equal((await call({action:'session',session_token:token})).status,200,id+' restored authorized session');
}
const roles=new Map(identities.map(([id,role])=>[id,role]));
let managerRosterCount=0,techRosterCount=0;
for(const [id,token] of tokens){
  const role=roles.get(id);
  const staff=await call({action:'manager_staff',session_token:token,command:{operation:'LIST'}});
  assert.equal(staff.status,role==='Manager'?200:403,id+' manager staff permission');
  if(role==='Manager'){
    assert.ok(staff.body.users.every(u=>!['Manager','Accountant'].includes(u.role)));
    managerRosterCount=staff.body.users.length;
  }
  const tech=await call({action:'technician_roster',session_token:token});
  assert.equal(tech.status,['Manager','Supervisor'].includes(role)?200:403,id+' technician roster scope');
  if(role==='Manager'){techRosterCount=tech.body.technicians.length;assert.equal(tech.body.technicians.some(u=>u.id==='QA-OFF'&&u.active===false),true);}
  const accountantManagement=await call({action:'manager_accountant',session_token:token,command:{operation:'LIST'}});
  assert.equal(accountantManagement.status,role==='Manager'?200:403,id+' Accountant account management');
  // The Manager profit report is narrower than general Accountant access.
  const profit=await accountantApi(admin,{id,role},{action:'accountant_report',report:'manager_profit',filters:{month:'2026-10'}},'QA-HMAC');
  if(role==='Manager')assert.notEqual(profit.status,403,'Manager must reach authorized report computation');
  else assert.equal(profit.status,403,id+' Manager profit report denied');
  if(!['Manager','Accountant'].includes(role)){
    const general=await accountantApi(admin,{id,role},{action:'accountant_dashboard'},'QA-HMAC');
    assert.equal(general.status,403,id+' Accountant dashboard denied');
  }
}
assert.ok(managerRosterCount>=5);
assert.equal(techRosterCount,2);
assert.equal(rpcCalls,1,'Accountant account listing Manager-only');
const checkId='00000000-0000-4000-8000-000000000001';
for(const [id,token] of tokens){
 const role=roles.get(id);
 const actor={id,role,department:credentials.find(x=>x.user_id===id).department,active:true};
 const result=await mechanicalInspectionApi({operation:'READ_INSPECTION',checklistId:checkId},{
   enabled:true,policy:{flags:{mechanical:true}},actor,
   verifySession:async()=>actor,
   authorizeChecklist:async()=>true,
   readInspection:async()=>({synthetic:true})
 });
 assert.equal(result.status,id==='SUP003'||role==='Manager'?200:403,id+' Mechanical Inspection boundary');
}
const old=tokens.get('QA-RCP');
assert.equal((await call({action:'logout',session_token:old})).status,200);
assert.equal((await call({action:'session',session_token:old})).status,401,'logout revokes Receptionist session');
const affected=credentials.find(x=>x.user_id==='QA-SUP');affected.active=false;
assert.equal((await call({action:'session',session_token:tokens.get('QA-SUP')})).status,401,'deactivated staff session rejected');
assert.equal((await call({action:'login',user_id:'QA-SUP',password:syntheticPassword})).status,401,'deactivated staff cannot log in');
const replacement=tokens.get('QA-EMP');
assert.equal((await call({action:'session',session_token:replacement})).status,200,'other staff session unaffected');
console.log('PASS isolated real login + token session matrix: 7 active roles, inactive blocked, role-scoped Manager/Accountant/technician/Mechanical read paths, logout and deactivation; production untouched.');
